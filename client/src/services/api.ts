import {
  User,
  Route,
  LiveBusState,
  StudentAllocationResponse,
  TripManifestResponse,
  FleetOverviewMetrics,
} from '../types/index.js';

const API_BASE = 'http://localhost:4000/api/v1';

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

    const response = await fetch(`${API_BASE}${endpoint}`, {
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

  public async getCampusBuildingsGeoJson(): Promise<any> {
    const res = await fetch(`${API_BASE}/routes/campus-buildings`);
    return res.json();
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
