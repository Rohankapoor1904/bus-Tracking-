import { getServerHost } from './api.js';

type EventCallback = (data: any) => void;

class RealTimeSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 20;
  private reconnectIntervalMs = 2000;
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private pendingSubscriptions: Set<string> = new Set();
  private isConnected = false;

  private getWsUrl(): string {
    const envUrl = import.meta.env.VITE_SERVER_URL as string | undefined;
    if (envUrl) {
      return envUrl.replace(/^http/, 'ws').replace(/\/$/, '') + '/ws';
    }
    const host = getServerHost().replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${host}/ws`;
  }

  public connect(token?: string, routeId?: string) {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    let connectUrl = this.getWsUrl();
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (routeId) params.set('routeId', routeId);
    if (params.toString()) {
      connectUrl += `?${params.toString()}`;
    }

    this.ws = new WebSocket(connectUrl);

    this.ws.onopen = () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit('connection_status', { connected: true });

      // Re-subscribe to pending channels
      for (const channel of this.pendingSubscriptions) {
        this.sendAction('SUBSCRIBE', channel);
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.event) {
          this.emit(message.event, message.data);
        }
      } catch (err) {
        console.error('Failed to parse WS message:', err);
      }
    };

    this.ws.onclose = () => {
      this.isConnected = false;
      this.emit('connection_status', { connected: false });
      this.attemptReconnect(token, routeId);
    };

    this.ws.onerror = (err) => {
      console.warn('WebSocket connection error:', err);
      this.ws?.close();
    };
  }

  private attemptReconnect(token?: string, routeId?: string) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('Max WebSocket reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(10000, this.reconnectIntervalMs * Math.pow(1.3, this.reconnectAttempts));
    setTimeout(() => {
      this.connect(token, routeId);
    }, delay);
  }

  public subscribe(channel: string) {
    this.pendingSubscriptions.add(channel);
    if (this.isConnected) {
      this.sendAction('SUBSCRIBE', channel);
    }
  }

  public unsubscribe(channel: string) {
    this.pendingSubscriptions.delete(channel);
    if (this.isConnected) {
      this.sendAction('UNSUBSCRIBE', channel);
    }
  }

  public sendDriverTelemetry(payload: {
    tripId: string;
    busId: string;
    routeId?: string;
    latitude: number;
    longitude: number;
    speed: number;
    bearing: number;
    accuracy?: number;
    altitude?: number;
    batteryLevel?: number;
  }) {
    this.sendAction('TELEMETRY_PING', undefined, payload);
  }

  public sendAttendanceUpdate(payload: {
    tripId: string;
    studentId: string;
    stopId: string;
    routeId: string;
    status: 'BOARDED' | 'ABSENT' | 'PENDING';
    verificationMethod: string;
  }) {
    this.sendAction('ATTENDANCE_UPDATE', undefined, payload);
  }

  public sendEmergencySOS(payload: {
    busId: string;
    latitude: number;
    longitude: number;
    message: string;
  }) {
    this.sendAction('EMERGENCY_SOS', undefined, payload);
  }

  private sendAction(action: string, channel?: string, payload?: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action, channel, payload }));
    }
  }

  public on(event: string, callback: EventCallback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  private emit(event: string, data: any) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((cb) => cb(data));
    }
  }

  public isSocketOpen(): boolean {
    return this.isConnected;
  }

  public disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const socketService = new RealTimeSocketService();
