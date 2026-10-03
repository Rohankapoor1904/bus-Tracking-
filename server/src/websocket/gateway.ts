import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import { WSInboundMessage, WSOutboundMessage, TelemetryPoint, UserRole } from '../types/index.js';
import { TelemetryService } from '../services/telemetry.service.js';
import { AuthService, TokenPayload } from '../services/auth.service.js';
import { db } from '../db/database.js';
import { redis } from '../db/redis.js';
import { config } from '../config/index.js';
import { telemetryPayloadSchema, attendanceSchema, sosSchema } from '../validation/schemas.js';

interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
  userId?: string;
  userRole?: UserRole;
  authenticated: boolean;
  subscriptions: Set<string>;
}

const ALLOWED_CHANNELS = (routeId?: string): string[] => [
  'admin:radar',
  ...(routeId ? [`route:${routeId}`] : []),
];

export class WebSocketGateway {
  private wss: WebSocketServer;

  constructor(server: HttpServer) {
    this.wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });

    TelemetryService.setBroadcaster(this.broadcastToChannel.bind(this));

    // Cross-instance fan-out: messages published by other app servers.
    redis
      .subscribe(['admin:radar', 'route'], (channel, message) => {
        this.broadcastToChannel(channel, JSON.parse(message));
      })
      .catch(() => undefined);

    this.initConnectionHandler();
    this.initHeartbeat();
  }

  private initConnectionHandler() {
    this.wss.on('connection', (ws: WebSocket, req) => {
      const extWs = ws as ExtendedWebSocket;
      extWs.isAlive = true;
      extWs.authenticated = false;
      extWs.subscriptions = new Set();

      try {
        const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
        const token = url.searchParams.get('token');
        const routeId = url.searchParams.get('routeId');

        if (token && this.applyAuth(extWs, token)) {
          this.grantSubscriptions(extWs, routeId ?? undefined);
        }
      } catch {
        /* malformed URL — treated as unauthenticated */
      }

      this.sendToClient(extWs, {
        event: 'CONNECTED',
        timestamp: new Date().toISOString(),
        data: {
          server: 'MMU FleetRadar 3D Telemetry Gateway',
          version: '1.0.0-PROD',
          authenticated: extWs.authenticated,
          subscribedChannels: Array.from(extWs.subscriptions),
        },
      });

      extWs.on('message', async (data: RawData) => {
        let message: WSInboundMessage;
        try {
          message = JSON.parse(data.toString());
        } catch {
          this.sendError(extWs, 'Invalid JSON frame or malformed packet');
          return;
        }
        try {
          await this.handleInboundMessage(extWs, message);
        } catch (err: any) {
          this.sendError(extWs, err.message || 'Message processing failed');
        }
      });

      extWs.on('pong', () => {
        extWs.isAlive = true;
      });

      extWs.on('close', () => {
        extWs.subscriptions.clear();
      });
    });
  }

  private applyAuth(ws: ExtendedWebSocket, token: string): boolean {
    try {
      const decoded = AuthService.verifyToken(token);
      ws.userId = decoded.userId;
      ws.userRole = decoded.role;
      ws.authenticated = true;
      return true;
    } catch {
      return false;
    }
  }

  /** Grant default channel access based on the authenticated role. */
  private grantSubscriptions(ws: ExtendedWebSocket, routeId?: string) {
    const role = ws.userRole;
    if (role === 'ADMIN' || role === 'DISPATCHER') {
      ws.subscriptions.add('admin:radar');
    }
    // Students and drivers may follow a transit corridor feed only.
    if ((role === 'STUDENT' || role === 'DRIVER') && routeId) {
      ws.subscriptions.add(`route:${routeId}`);
    }
  }

  private async handleInboundMessage(ws: ExtendedWebSocket, msg: WSInboundMessage) {
    switch (msg.action) {
      case 'AUTH': {
        if (msg.payload?.token && this.applyAuth(ws, msg.payload.token)) {
          this.grantSubscriptions(ws);
          this.sendToClient(ws, {
            event: 'AUTH_SUCCESS',
            timestamp: new Date().toISOString(),
            data: { userId: ws.userId, role: ws.userRole },
          });
        } else {
          this.sendError(ws, 'Authentication failed');
        }
        break;
      }

      case 'SUBSCRIBE': {
        if (!ws.authenticated) {
          this.sendError(ws, 'Authentication required to subscribe');
          break;
        }
        const requested = msg.channel || (msg.payload?.routeId ? `route:${msg.payload.routeId}` : undefined);
        if (!requested) break;
        if (this.canSubscribe(ws, requested)) {
          ws.subscriptions.add(requested);
        } else {
          this.sendError(ws, `Not authorized to subscribe to ${requested}`);
        }
        break;
      }

      case 'UNSUBSCRIBE': {
        if (msg.channel) ws.subscriptions.delete(msg.channel);
        break;
      }

      case 'TELEMETRY_PING': {
        await this.handleTelemetry(ws, msg.payload);
        break;
      }

      case 'ATTENDANCE_UPDATE': {
        if (ws.userRole !== 'DRIVER' && ws.userRole !== 'ADMIN') {
          this.sendError(ws, 'Not authorized to update attendance');
          break;
        }
        const parsed = attendanceSchema.safeParse(msg.payload);
        if (!parsed.success) {
          this.sendError(ws, 'Invalid attendance payload');
          break;
        }
        const record = await db.upsertAttendanceRecord({
          ...parsed.data,
          verificationMethod: parsed.data.verificationMethod || 'MANUAL_CONSOLE',
        });
        const trip = await db.getTripSessionById(parsed.data.tripId);
        const outMsg: WSOutboundMessage = {
          event: 'ATTENDANCE_CHANGED',
          timestamp: new Date().toISOString(),
          data: record,
        };
        if (trip) this.broadcastToChannel(`route:${trip.routeId}`, outMsg);
        this.broadcastToChannel('admin:radar', outMsg);
        break;
      }

      case 'EMERGENCY_SOS': {
        if (ws.userRole !== 'DRIVER' && ws.userRole !== 'ADMIN') {
          this.sendError(ws, 'Not authorized to raise SOS');
          break;
        }
        const parsed = sosSchema.safeParse(msg.payload);
        if (!parsed.success) {
          this.sendError(ws, 'Invalid SOS payload');
          break;
        }
        await TelemetryService.triggerEmergencySOS(
          parsed.data.busId,
          ws.userId || 'driver',
          parsed.data.latitude ?? 30.25045,
          parsed.data.longitude ?? 77.04505,
          parsed.data.message || 'Driver requested emergency assistance'
        );
        break;
      }

      default:
        this.sendError(ws, `Unsupported action: ${String(msg.action)}`);
    }
  }

  private async handleTelemetry(ws: ExtendedWebSocket, payload: any) {
    if (ws.userRole !== 'DRIVER' && ws.userRole !== 'ADMIN') {
      this.sendError(ws, 'Authentication required to publish telemetry');
      return;
    }

    const parsed = telemetryPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      this.sendError(ws, 'Invalid telemetry payload');
      return;
    }
    const p = parsed.data;

    // Coordinate bounds: reject spoofed/remote injections outside the MMU corridor.
    const bbox = config.telemetryBBox;
    if (
      p.latitude < bbox.minLat ||
      p.latitude > bbox.maxLat ||
      p.longitude < bbox.minLng ||
      p.longitude > bbox.maxLng
    ) {
      console.warn(
        `[Telemetry] Rejected out-of-bounds ping for ${p.busId}: [${p.latitude}, ${p.longitude}]`
      );
      return;
    }

    // Drivers may only broadcast for a bus they are assigned to.
    if (ws.userRole === 'DRIVER') {
      const user = ws.userId ? await db.getUserById(ws.userId) : null;
      if (!user?.assignedBusId || user.assignedBusId !== p.busId) {
        this.sendError(ws, 'Not authorized to broadcast for this vehicle');
        return;
      }
    }

    const speed = Math.min(Number(p.speed ?? p.speedKmh ?? 0), config.maxTelemetrySpeedKmh);
    const point: TelemetryPoint = {
      tripId: p.tripId || '',
      busId: p.busId,
      routeId: p.routeId,
      latitude: p.latitude,
      longitude: p.longitude,
      speedKmh: speed,
      bearing: Number(p.bearing ?? 0),
      altitudeM: Number(p.altitude ?? p.altitudeM ?? 265),
      accuracyM: Number(p.accuracy ?? p.accuracyM ?? 3),
      batteryPercent: Number(p.batteryLevel ?? p.batteryPercent ?? 90),
      recordedAt: new Date(p.timestamp ?? Date.now()).toISOString(),
    };

    await TelemetryService.processTelemetry(point);
  }

  private canSubscribe(ws: ExtendedWebSocket, channel: string): boolean {
    if (channel === 'admin:radar') {
      return ws.userRole === 'ADMIN' || ws.userRole === 'DISPATCHER';
    }
    if (channel.startsWith('route:')) {
      // Any authenticated user may follow a transit corridor feed.
      return ws.authenticated;
    }
    return false;
  }

  public broadcastToChannel(channel: string, message: WSOutboundMessage) {
    const raw = JSON.stringify(message);
    let deliveredLocally = false;
    this.wss.clients.forEach((client) => {
      const extWs = client as ExtendedWebSocket;
      if (extWs.readyState === WebSocket.OPEN && extWs.subscriptions.has(channel)) {
        extWs.send(raw);
        deliveredLocally = true;
      }
    });
    // Fan out to other app-server instances (no-op when Redis is disabled).
    redis.publish(channel, raw).catch(() => undefined);
    return deliveredLocally;
  }

  private sendToClient(ws: WebSocket, message: WSOutboundMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, message: string) {
    this.sendToClient(ws, {
      event: 'ERROR',
      timestamp: new Date().toISOString(),
      data: { message },
    });
  }

  private initHeartbeat() {
    setInterval(() => {
      this.wss.clients.forEach((client) => {
        const extWs = client as ExtendedWebSocket;
        if (!extWs.isAlive) {
          return extWs.terminate();
        }
        extWs.isAlive = false;
        extWs.ping();
      });
    }, 30000);
  }

  public destroy() {
    this.wss.close();
  }
}
