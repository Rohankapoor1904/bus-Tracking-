import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { WSInboundMessage, WSOutboundMessage, TelemetryPoint } from '../types/index.js';
import { TelemetryService } from '../services/telemetry.service.js';
import { AuthService } from '../services/auth.service.js';
import { db } from '../db/database.js';

interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
  userId?: string;
  userRole?: string;
  subscriptions: Set<string>;
}

export class WebSocketGateway {
  private wss: WebSocketServer;

  constructor(server: HttpServer) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    // Link TelemetryService broadcaster
    TelemetryService.setBroadcaster(this.broadcastToChannel.bind(this));

    this.initConnectionHandler();
    this.initHeartbeat();
  }

  private initConnectionHandler() {
    this.wss.on('connection', (ws: WebSocket, req) => {
      const extWs = ws as ExtendedWebSocket;
      extWs.isAlive = true;
      extWs.subscriptions = new Set(['admin:radar']); // Default radar channel

      // Extract query params if available
      try {
        const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
        const token = url.searchParams.get('token');
        const role = url.searchParams.get('role');
        const routeId = url.searchParams.get('routeId');

        if (token) {
          try {
            const decoded = AuthService.verifyToken(token);
            extWs.userId = decoded.userId;
            extWs.userRole = decoded.role;
          } catch {
            // Allow anonymous view mode with basic subscriptions
          }
        }

        if (routeId) {
          extWs.subscriptions.add(`route:${routeId}`);
        }
      } catch (e) {
        // Continue connection
      }

      // Send welcome handshake
      this.sendToClient(extWs, {
        event: 'CONNECTED',
        timestamp: new Date().toISOString(),
        data: {
          server: 'MMU FleetRadar 3D Telemetry Gateway',
          version: '1.0.0-PROD',
          subscribedChannels: Array.from(extWs.subscriptions),
        },
      });

      // Handle inbound frames
      extWs.on('message', async (data: Buffer | string) => {
        try {
          const message: WSInboundMessage = JSON.parse(data.toString());
          await this.handleInboundMessage(extWs, message);
        } catch (err: any) {
          this.sendToClient(extWs, {
            event: 'ERROR',
            timestamp: new Date().toISOString(),
            data: { message: 'Invalid JSON frame or malformed packet' },
          });
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

  private async handleInboundMessage(ws: ExtendedWebSocket, msg: WSInboundMessage) {
    switch (msg.action) {
      case 'AUTH': {
        if (msg.payload?.token) {
          try {
            const decoded = AuthService.verifyToken(msg.payload.token);
            ws.userId = decoded.userId;
            ws.userRole = decoded.role;
            this.sendToClient(ws, {
              event: 'AUTH_SUCCESS',
              timestamp: new Date().toISOString(),
              data: { user: decoded },
            });
          } catch (e: any) {
            this.sendToClient(ws, {
              event: 'ERROR',
              timestamp: new Date().toISOString(),
              data: { message: 'Authentication failed: ' + e.message },
            });
          }
        }
        break;
      }

      case 'SUBSCRIBE': {
        if (msg.channel) {
          ws.subscriptions.add(msg.channel);
        }
        if (msg.payload?.routeId) {
          ws.subscriptions.add(`route:${msg.payload.routeId}`);
        }
        break;
      }

      case 'UNSUBSCRIBE': {
        if (msg.channel) {
          ws.subscriptions.delete(msg.channel);
        }
        break;
      }

      case 'TELEMETRY_PING': {
        if (msg.payload) {
          const point: TelemetryPoint = {
            tripId: msg.payload.tripId || 'trip-live',
            busId: msg.payload.busId,
            routeId: msg.payload.routeId,
            latitude: Number(msg.payload.latitude),
            longitude: Number(msg.payload.longitude),
            speedKmh: Number(msg.payload.speed || msg.payload.speedKmh || 0),
            bearing: Number(msg.payload.bearing || 0),
            altitudeM: Number(msg.payload.altitude || msg.payload.altitudeM || 265),
            accuracyM: Number(msg.payload.accuracy || 3.0),
            batteryPercent: Number(msg.payload.batteryLevel || msg.payload.batteryPercent || 90),
            recordedAt: new Date(msg.payload.timestamp || Date.now()).toISOString(),
          };

          await TelemetryService.processTelemetry(point);
        }
        break;
      }

      case 'ATTENDANCE_UPDATE': {
        if (msg.payload) {
          const record = await db.upsertAttendanceRecord(msg.payload);
          const outMsg: WSOutboundMessage = {
            event: 'ATTENDANCE_CHANGED',
            timestamp: new Date().toISOString(),
            data: record,
          };
          this.broadcastToChannel(`route:${msg.payload.routeId}`, outMsg);
          this.broadcastToChannel('admin:radar', outMsg);
        }
        break;
      }

      case 'EMERGENCY_SOS': {
        if (msg.payload) {
          await TelemetryService.triggerEmergencySOS(
            msg.payload.busId,
            ws.userId || 'driver',
            msg.payload.latitude || 30.25045,
            msg.payload.longitude || 77.04505,
            msg.payload.message || 'Driver requested emergency assistance'
          );
        }
        break;
      }
    }
  }

  public broadcastToChannel(channel: string, message: WSOutboundMessage) {
    const raw = JSON.stringify(message);
    this.wss.clients.forEach((client) => {
      const extWs = client as ExtendedWebSocket;
      if (extWs.readyState === WebSocket.OPEN && extWs.subscriptions.has(channel)) {
        extWs.send(raw);
      }
    });
  }

  private sendToClient(ws: WebSocket, message: WSOutboundMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
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
