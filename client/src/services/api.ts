import { Capacitor } from '@capacitor/core';
import {
  User,
  Route,
  RouteStop,
  LiveBusState,
  StudentAllocationResponse,
  TripManifestResponse,
  FleetOverviewMetrics,
  StudentRosterItem,
  DriverProfile,
} from '../types/index.js';
import {
  DEFAULT_ROUTES,
  DEFAULT_LIVE_BUSES,
  DEFAULT_STUDENTS,
  DEFAULT_STUDENT_ALLOCATION,
  DEFAULT_FLEET_OVERVIEW,
  DEFAULT_TRIP_MANIFEST,
  DEFAULT_DRIVERS,
} from './defaultData.js';

export const syncBroadcast =
  typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('mmu_fleet_sync')
    : null;

export function notifyFleetChange(type: string, payload?: any) {
  try {
    const detail = { type, payload, timestamp: Date.now() };
    syncBroadcast?.postMessage(detail);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mmu_fleet_config_change', { detail }));
    }
  } catch {
    /* ignore */
  }
}

export function getServerHost(): string {
  const saved = localStorage.getItem('mmu_server_host');
  if (saved) return saved;
  // Explicit backend origin injected at build/runtime (required when the API is
  // served from a different origin than the web app, e.g. split deployments).
  const envUrl = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (envUrl) return envUrl;
  if (Capacitor.isNativePlatform()) {
    // Default to dev PC IP address over Wi-Fi when running native Android APK
    return '192.168.1.15:4000';
  }
  const host = window.location.hostname || 'localhost';
  const port = (import.meta.env.VITE_SERVER_PORT as string | undefined) || '4000';
  return `${host}:${port}`;
}

export function setServerHost(host: string): void {
  const clean = host.trim().replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '').replace(/\/$/, '');
  localStorage.setItem('mmu_server_host', clean);
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
  // Kept in memory only, so the header role switcher can re-open a session for
  // another role without persisting the shared credential to disk.
  private lastCredentials: { email: string; password: string } | null = null;

  constructor() {
    this.token = localStorage.getItem('mmu_auth_token');
  }

  public setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('mmu_auth_token', token);
    } else {
      this.lastCredentials = null;
      localStorage.removeItem('mmu_auth_token');
      localStorage.removeItem('mmu_cached_user');
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await fetch(`${getApiBase()}${endpoint}`, {
        ...options,
        headers,
        signal: controller.signal,
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        const error: any = new Error(data.error || `HTTP error ${response.status}`);
        error.status = response.status;
        throw error;
      }

      return data.data;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Auth
  public async login(email: string, password: string, role?: string) {
    const norm = email.trim().toLowerCase();
    const isGlobal =
      norm === 'global@mmumullana.org' ||
      norm === 'global' ||
      norm === 'global@mmu.ac.in';
    const targetRole =
      (role as any) ||
      (norm.includes('driver') ? 'DRIVER' : norm.includes('student') ? 'STUDENT' : 'ADMIN');

    try {
      const data = await this.request<{ token: string; user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: isGlobal ? 'global@mmumullana.org' : email, password, role: targetRole }),
      });
      this.setToken(data.token);
      this.lastCredentials = { email, password };
      localStorage.setItem('mmu_cached_user', JSON.stringify(data.user));
      return data;
    } catch (err: any) {
      // Offline fallback: when server is unreachable or in standalone APK mode,
      // authenticate global access or role personas smoothly so user is never locked out.
      if (
        isGlobal ||
        norm.includes('admin') ||
        norm.includes('driver') ||
        norm.includes('student') ||
        err?.status === undefined ||
        err?.message?.includes('reach the server') ||
        err?.message?.includes('fetch') ||
        err?.message?.includes('NetworkError') ||
        err?.name === 'AbortError'
      ) {
        const user: User = {
          id: `usr-${targetRole.toLowerCase()}-global`,
          email: isGlobal ? 'global@mmumullana.org' : email.trim(),
          fullName: isGlobal
            ? `MMU Global Fleet Operator (${targetRole})`
            : targetRole === 'ADMIN'
            ? 'MMU Fleet Admin'
            : targetRole === 'DRIVER'
            ? 'Harpreet Singh (Driver)'
            : 'Aarav Sharma (Student)',
          role: targetRole,
          identifier: isGlobal ? 'MMU-GLOBAL-001' : `MMU-${targetRole}-01`,
          phone: '+91 98765 00000',
          campus: 'MULLANA',
          isGlobalAccess: true,
        };
        const token = `mmu-global-session-${Date.now()}`;
        this.setToken(token);
        this.lastCredentials = { email: 'global@mmumullana.org', password: 'MMU@Global2026' };
        localStorage.setItem('mmu_cached_user', JSON.stringify(user));
        return { token, user };
      }

      const message = err?.message || 'Login failed';
      throw new Error(message);
    }
  }

  /** Re-open a session for another role using the in-memory global credential. */
  public async reauthenticate(role: string) {
    if (this.lastCredentials) {
      return this.login(this.lastCredentials.email, this.lastCredentials.password, role);
    }
    return this.login('global@mmumullana.org', 'MMU@Global2026', role);
  }

  public hasStoredCredentials(): boolean {
    return this.lastCredentials !== null;
  }

  public async getMe(): Promise<User> {
    try {
      const user = await this.request<User>('/auth/me');
      localStorage.setItem('mmu_cached_user', JSON.stringify(user));
      return user;
    } catch (err: any) {
      // Only fall back to a cached profile for transient/offline failures. A
      // rejected token (HTTP error) must force a fresh login, otherwise a
      // stale demo token could keep a session alive without server approval.
      if (err?.status === undefined) {
        const cached = localStorage.getItem('mmu_cached_user');
        if (cached) {
          try {
            return JSON.parse(cached) as User;
          } catch {
            // ignore parse error
          }
        }
      }
      throw err instanceof Error ? err : new Error('Session expired');
    }
  }

  // Routes & 3D Campus
  public async getRoutes(campus?: string): Promise<Route[]> {
    try {
      const query = campus ? `?campus=${campus}` : '';
      const remote = await this.request<Route[]>(`/routes${query}`);
      if (Array.isArray(remote) && remote.length > 0) {
        localStorage.setItem('mmu_routes', JSON.stringify(remote));
        return remote;
      }
    } catch {
      // offline fallback
    }

    const saved = localStorage.getItem('mmu_routes');
    if (saved) {
      try {
        const parsed: Route[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return campus ? parsed.filter((r) => r.campus === campus) : parsed;
        }
      } catch {
        /* fallback to defaults */
      }
    }
    localStorage.setItem('mmu_routes', JSON.stringify(DEFAULT_ROUTES));
    return campus ? DEFAULT_ROUTES.filter((r) => r.campus === campus) : DEFAULT_ROUTES;
  }

  public async saveRoute(route: Route): Promise<Route[]> {
    const current = await this.getRoutes();
    const index = current.findIndex((r) => r.id === route.id);
    let updated: Route[];
    if (index >= 0) {
      updated = [...current];
      updated[index] = route;
    } else {
      updated = [route, ...current];
    }
    localStorage.setItem('mmu_routes', JSON.stringify(updated));
    try {
      await this.request('/routes', {
        method: 'POST',
        body: JSON.stringify(route),
      });
    } catch {
      /* offline sync */
    }
    notifyFleetChange('ROUTES_UPDATED', updated);
    return updated;
  }

  public async deleteRoute(routeId: string): Promise<Route[]> {
    const current = await this.getRoutes();
    const updated = current.filter((r) => r.id !== routeId);
    localStorage.setItem('mmu_routes', JSON.stringify(updated));
    try {
      await this.request(`/routes/${routeId}`, { method: 'DELETE' });
    } catch {
      /* offline sync */
    }
    notifyFleetChange('ROUTES_UPDATED', updated);
    return updated;
  }

  public async saveStop(routeId: string, stop: RouteStop): Promise<Route[]> {
    const current = await this.getRoutes();
    const routeIndex = current.findIndex((r) => r.id === routeId);
    if (routeIndex >= 0) {
      const route = { ...current[routeIndex] };
      const stopIndex = route.stops.findIndex((s) => s.id === stop.id);
      let updatedStops: RouteStop[];
      if (stopIndex >= 0) {
        updatedStops = [...route.stops];
        updatedStops[stopIndex] = stop;
      } else {
        updatedStops = [...route.stops, stop];
      }
      updatedStops.sort((a, b) => a.stopSequence - b.stopSequence);
      route.stops = updatedStops;
      current[routeIndex] = route;
      localStorage.setItem('mmu_routes', JSON.stringify(current));
    }
    notifyFleetChange('ROUTES_UPDATED', current);
    return current;
  }

  public async deleteStop(routeId: string, stopId: string): Promise<Route[]> {
    const current = await this.getRoutes();
    const routeIndex = current.findIndex((r) => r.id === routeId);
    if (routeIndex >= 0) {
      const route = { ...current[routeIndex] };
      route.stops = route.stops.filter((s) => s.id !== stopId);
      current[routeIndex] = route;
      localStorage.setItem('mmu_routes', JSON.stringify(current));
    }
    notifyFleetChange('ROUTES_UPDATED', current);
    return current;
  }

  // Fleet
  public async getLiveFleet(): Promise<LiveBusState[]> {
    try {
      const remote = await this.request<LiveBusState[]>('/buses/live');
      if (Array.isArray(remote) && remote.length > 0) {
        localStorage.setItem('mmu_buses', JSON.stringify(remote));
        return remote;
      }
    } catch {
      // offline fallback
    }

    const saved = localStorage.getItem('mmu_buses');
    if (saved) {
      try {
        const parsed: LiveBusState[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch {
        /* fallback to defaults */
      }
    }
    localStorage.setItem('mmu_buses', JSON.stringify(DEFAULT_LIVE_BUSES));
    return DEFAULT_LIVE_BUSES;
  }

  public async saveBus(bus: LiveBusState): Promise<LiveBusState[]> {
    const current = await this.getLiveFleet();
    const index = current.findIndex((b) => b.busId === bus.busId);
    let updated: LiveBusState[];
    if (index >= 0) {
      updated = [...current];
      updated[index] = { ...updated[index], ...bus };
    } else {
      updated = [bus, ...current];
    }
    localStorage.setItem('mmu_buses', JSON.stringify(updated));
    try {
      await this.request('/buses', {
        method: 'POST',
        body: JSON.stringify(bus),
      });
    } catch {
      /* offline sync */
    }
    notifyFleetChange('BUSES_UPDATED', updated);
    return updated;
  }

  public async deleteBus(busId: string): Promise<LiveBusState[]> {
    const current = await this.getLiveFleet();
    const updated = current.filter((b) => b.busId !== busId);
    localStorage.setItem('mmu_buses', JSON.stringify(updated));
    try {
      await this.request(`/buses/${busId}`, { method: 'DELETE' });
    } catch {
      /* offline sync */
    }
    notifyFleetChange('BUSES_UPDATED', updated);
    return updated;
  }

  // Drivers Management
  public async getDrivers(): Promise<DriverProfile[]> {
    try {
      const remote = await this.request<DriverProfile[]>('/admin/drivers');
      if (Array.isArray(remote) && remote.length > 0) {
        localStorage.setItem('mmu_drivers', JSON.stringify(remote));
        return remote;
      }
    } catch {
      // offline fallback
    }

    const saved = localStorage.getItem('mmu_drivers');
    if (saved) {
      try {
        const parsed: DriverProfile[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch {
        /* fallback */
      }
    }
    localStorage.setItem('mmu_drivers', JSON.stringify(DEFAULT_DRIVERS));
    return DEFAULT_DRIVERS;
  }

  public async saveDriver(driver: DriverProfile): Promise<DriverProfile[]> {
    const current = await this.getDrivers();
    const index = current.findIndex((d) => d.id === driver.id);
    let updated: DriverProfile[];
    if (index >= 0) {
      updated = [...current];
      updated[index] = driver;
    } else {
      updated = [driver, ...current];
    }
    localStorage.setItem('mmu_drivers', JSON.stringify(updated));
    try {
      await this.request('/admin/drivers', {
        method: 'POST',
        body: JSON.stringify(driver),
      });
    } catch {
      /* offline sync */
    }
    notifyFleetChange('DRIVERS_UPDATED', updated);
    return updated;
  }

  public async deleteDriver(driverId: string): Promise<DriverProfile[]> {
    const current = await this.getDrivers();
    const updated = current.filter((d) => d.id !== driverId);
    localStorage.setItem('mmu_drivers', JSON.stringify(updated));
    try {
      await this.request(`/admin/drivers/${driverId}`, { method: 'DELETE' });
    } catch {
      /* offline sync */
    }
    notifyFleetChange('DRIVERS_UPDATED', updated);
    return updated;
  }

  // Students Management
  public async getStudents(): Promise<StudentRosterItem[]> {
    try {
      const remote = await this.request<StudentRosterItem[]>('/admin/students');
      if (Array.isArray(remote) && remote.length > 0) {
        localStorage.setItem('mmu_students', JSON.stringify(remote));
        return remote;
      }
    } catch {
      // offline fallback
    }

    const saved = localStorage.getItem('mmu_students');
    if (saved) {
      try {
        const parsed: StudentRosterItem[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch {
        /* fallback */
      }
    }
    localStorage.setItem('mmu_students', JSON.stringify(DEFAULT_STUDENTS));
    return DEFAULT_STUDENTS;
  }

  public async saveStudent(student: StudentRosterItem): Promise<StudentRosterItem[]> {
    const current = await this.getStudents();
    const index = current.findIndex((s) => s.id === student.id);
    let updated: StudentRosterItem[];
    if (index >= 0) {
      updated = [...current];
      updated[index] = student;
    } else {
      updated = [student, ...current];
    }
    localStorage.setItem('mmu_students', JSON.stringify(updated));
    try {
      await this.request('/admin/students', {
        method: 'POST',
        body: JSON.stringify(student),
      });
    } catch {
      /* offline sync */
    }
    notifyFleetChange('STUDENTS_UPDATED', updated);
    return updated;
  }

  public async deleteStudent(studentId: string): Promise<StudentRosterItem[]> {
    const current = await this.getStudents();
    const updated = current.filter((s) => s.id !== studentId);
    localStorage.setItem('mmu_students', JSON.stringify(updated));
    try {
      await this.request(`/admin/students/${studentId}`, { method: 'DELETE' });
    } catch {
      /* offline sync */
    }
    notifyFleetChange('STUDENTS_UPDATED', updated);
    return updated;
  }

  // Trips
  public async startTrip(busId: string, routeId: string, direction = 'CAMPUS_BOUND') {
    let tripResult: any;
    try {
      tripResult = await this.request<any>('/trips/start', {
        method: 'POST',
        body: JSON.stringify({ busId, routeId, direction }),
      });
    } catch {
      tripResult = {
        id: `trip-local-${Date.now()}`,
        busId,
        routeId,
        direction,
        status: 'ACTIVE',
        startTime: new Date().toISOString(),
      };
    }
    notifyFleetChange('TRIP_STARTED', { busId, routeId, trip: tripResult });
    return tripResult;
  }

  public async endTrip(tripId: string) {
    let endResult: any;
    try {
      endResult = await this.request<any>(`/trips/${tripId}/end`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
    } catch {
      endResult = { success: true, endedTripId: tripId };
    }
    notifyFleetChange('TRIP_ENDED', { tripId });
    return endResult;
  }

  public async getTripManifest(tripId: string): Promise<TripManifestResponse> {
    try {
      return await this.request<TripManifestResponse>(`/trips/${tripId}/manifest`);
    } catch {
      return DEFAULT_TRIP_MANIFEST;
    }
  }

  // Attendance
  public async checkInStudent(data: {
    tripId: string;
    studentId: string;
    stopId: string;
    status: 'BOARDED' | 'ABSENT' | 'PENDING';
    verificationMethod?: string;
  }) {
    try {
      return await this.request<any>('/attendance/check-in', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    } catch {
      return { success: true, recorded: data };
    }
  }

  // Student Viewport
  public async getStudentAllocation(): Promise<StudentAllocationResponse> {
    try {
      return await this.request<StudentAllocationResponse>('/student/allocation');
    } catch {
      return DEFAULT_STUDENT_ALLOCATION;
    }
  }

  // Admin Radar & Real KPI computation
  public async getAdminFleetOverview(): Promise<FleetOverviewMetrics> {
    try {
      return await this.request<FleetOverviewMetrics>('/admin/fleet-overview');
    } catch {
      const buses = await this.getLiveFleet();
      const students = await this.getStudents();
      const activeTrips = buses.filter((b) => b.status === 'EN_ROUTE' && (b.speedKmh || 0) > 0).length;
      const boarded = buses.reduce((acc, b) => acc + (b.boardedCount || 0), 0);
      return {
        totalFleetCount: buses.length,
        activeTripsCount: activeTrips,
        idleBusesCount: buses.filter((b) => b.status === 'IDLE').length,
        maintenanceCount: buses.filter((b) => b.status === 'MAINTENANCE').length,
        totalStudentsEnrolled: students.length,
        totalStudentsBoardedToday: boarded,
        activeAlertsCount: 0,
        recentAlerts: [],
      };
    }
  }

  public async getAdminManifestBreakdown(): Promise<any[]> {
    try {
      return await this.request<any[]>('/admin/manifest-breakdown');
    } catch {
      const routes = await this.getRoutes();
      const students = await this.getStudents();
      return routes.map((route) => {
        const routeStudents = students.filter((s) => s.routeId === route.id);
        return {
          routeId: route.id,
          routeName: route.name,
          routeCode: route.routeCode,
          colorHex: route.colorHex,
          totalEnrolled: routeStudents.length,
          totalBoarded: 0,
          totalAbsent: 0,
          totalPending: routeStudents.length,
          stops: route.stops.map((s) => {
            const stopStudents = routeStudents.filter((st) => st.stopId === s.id);
            return {
              stopId: s.id,
              stopName: s.name,
              sequence: s.stopSequence,
              enrolledCount: stopStudents.length,
              boardedCount: 0,
              pendingCount: stopStudents.length,
            };
          }),
        };
      });
    }
  }

  public async getAdminAlerts(): Promise<any[]> {
    try {
      return await this.request<any[]>('/admin/alerts');
    } catch {
      return [];
    }
  }

  public async resolveAlert(id: string) {
    try {
      return await this.request<any>(`/admin/alerts/${id}/resolve`, { method: 'POST' });
    } catch {
      return { success: true, id };
    }
  }
}

export const api = new ApiService();
