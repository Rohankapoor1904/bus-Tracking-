import { Capacitor } from '@capacitor/core';
import {
  User,
  Route,
  LiveBusState,
  StudentAllocationResponse,
  TripManifestResponse,
  FleetOverviewMetrics,
} from '../types/index.js';

export function getServerHost(): string {
  const saved = localStorage.getItem('mmu_server_host');
  if (saved) return saved;
  // Explicit backend origin injected at build/runtime (required when the API is
  // served from a different origin than the web app, e.g. split deployments).
  const envUrl = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (envUrl) return envUrl;
  if (Capacitor.isNativePlatform()) {
    // Default to dev PC IP address over Wi-Fi when running native Android APK
    return '192.168.1.12:4000';
  }
  // Single-origin deployments (reverse proxy serves both the SPA and the API)
  // talk to whatever host/port the page itself was loaded from.
  if (import.meta.env.VITE_SAME_ORIGIN === 'true') {
    return window.location.host;
  }
  const host = window.location.hostname || 'localhost';
  const port = (import.meta.env.VITE_SERVER_PORT as string | undefined) || '4000';
  return `${host}:${port}`;
}

export function getServerOrigin(): string {
  const host = getServerHost();
  if (/^https?:\/\//.test(host)) return host.replace(/\/$/, '');
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  return `${protocol}//${host}`;
}

export function getApiBase(): string {
  return `${getServerOrigin()}/api/v1`;
}

class ApiService {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('mmu_auth_token');
  }

  public setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('mmu_auth_token', token);
    } else {
      localStorage.removeItem('mmu_auth_token');
    }
  }

  public getToken(): string | null {
    return this.token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${getApiBase()}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || `HTTP error ${response.status}`);
    }

    return data.data;
  }

  // Auth
  public async login(email: string, password: string, role?: string) {
    const data = await this.request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, role }),
    });
    this.setToken(data.token);
    return data;
  }

  public async getMe(): Promise<User> {
    return this.request<User>('/auth/me');
  }

  public async getDemoAccounts() {
    return this.request<{ defaultPassword: string; accounts: any[] }>('/auth/demo-accounts');
  }

  // Routes & 3D Campus
  public async getRoutes(campus?: string): Promise<Route[]> {
    const query = campus ? `?campus=${campus}` : '';
    return this.request<Route[]>(`/routes${query}`);
  }

  // Fleet
  public async getLiveFleet(): Promise<LiveBusState[]> {
    return this.request<LiveBusState[]>('/buses/live');
  }

  // Trips
  public async startTrip(busId: string, routeId: string, direction = 'CAMPUS_BOUND') {
    return this.request<any>('/trips/start', {
      method: 'POST',
      body: JSON.stringify({ busId, routeId, direction }),
    });
  }

  public async endTrip(tripId: string) {
    return this.request<any>(`/trips/${tripId}/end`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  public async getTripManifest(tripId: string): Promise<TripManifestResponse> {
    return this.request<TripManifestResponse>(`/trips/${tripId}/manifest`);
  }

  // Attendance
  public async checkInStudent(data: {
    tripId: string;
    studentId: string;
    stopId: string;
    status: 'BOARDED' | 'ABSENT' | 'PENDING';
    verificationMethod?: string;
  }) {
    return this.request<any>('/attendance/check-in', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Student Viewport
  public async getStudentAllocation(): Promise<StudentAllocationResponse> {
    return this.request<StudentAllocationResponse>('/student/allocation');
  }

  // Admin Radar
  public async getAdminFleetOverview(): Promise<FleetOverviewMetrics> {
    return this.request<FleetOverviewMetrics>('/admin/fleet-overview');
  }

  public async getAdminManifestBreakdown(): Promise<any[]> {
    return this.request<any[]>('/admin/manifest-breakdown');
  }

  public async getAdminAlerts(): Promise<any[]> {
    return this.request<any[]>('/admin/alerts');
  }

  public async resolveAlert(id: string) {
    return this.request<any>(`/admin/alerts/${id}/resolve`, { method: 'POST' });
  }
}

export const api = new ApiService();
