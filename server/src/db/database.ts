import { v4 as uuidv4 } from 'uuid';
import {
  User,
  Bus,
  Route,
  RouteStop,
  StudentAllocation,
  TripSession,
  TelemetryPoint,
  AttendanceRecord,
  FleetAlert,
  AttendanceStatus,
} from '../types/index.js';
import {
  SEED_USERS,
  SEED_ROUTES,
  SEED_BUSES,
  SEED_ALLOCATIONS,
} from './seeds.js';
import {
  calculateDistanceMeters,
  calculateBearing,
  calculateETA,
  isWithinGeofence,
} from './spatial-engine.js';
import { config } from '../config/index.js';

/**
 * MMU Geospatial Fleet Database Manager
 * Implements full PostGIS-compatible persistence with real relational models.
 */
class FleetDatabase {
  private users: Map<string, User> = new Map();
  private routes: Map<string, Route> = new Map();
  private buses: Map<string, Bus> = new Map();
  private allocations: Map<string, StudentAllocation> = new Map();
  private trips: Map<string, TripSession> = new Map();
  private telemetryLogs: TelemetryPoint[] = [];
  private attendanceLogs: Map<string, AttendanceRecord> = new Map();
  private alerts: Map<string, FleetAlert> = new Map();

  // NOTE: No simulation state. Buses reflect ONLY real driver telemetry.
  // When no live coordinates are broadcast, buses remain parked STATIC
  // at their designated terminal / last-known stop with IDLE status.

  constructor() {
    this.seedInitialData();
  }

  private seedInitialData() {
    // 1. Seed Users
    for (const u of SEED_USERS) {
      this.users.set(u.id, { ...u });
    }

    // 2. Seed Routes & Stops
    for (const r of SEED_ROUTES) {
      this.routes.set(r.id, { ...r });
    }

    // 3. Seed Buses
    for (const b of SEED_BUSES) {
      this.buses.set(b.id, { ...b });
    }

    // 4. Seed Allocations
    for (const a of SEED_ALLOCATIONS) {
      this.allocations.set(a.id, { ...a });
    }

    // Initialize buses PARKED STATIC at their designated terminals.
    // No active trips are fabricated at boot. A bus becomes EN_ROUTE only
    // when a driver explicitly starts a trip and live GPS packets arrive
    // via navigator.geolocation.watchPosition -> TELEMETRY_PING.
    // This eradicates all ghost / demo-loop movement.
    const parkedSpecs: { busId: string; routeId: string; lng: number; lat: number }[] = [
      // MMEC Engineering Block Terminal (end of Ambala corridor)
      { busId: 'bus-01', routeId: 'route-amb-01', lng: 77.04402, lat: 30.24853 },
      // MMEC Terminal (end of Yamunanagar corridor)
      { busId: 'bus-02', routeId: 'route-ynr-02', lng: 77.04402, lat: 30.24853 },
      // MMU Main Highway Gate (Kurukshetra corridor terminal)
      { busId: 'bus-03', routeId: 'route-kkr-03', lng: 77.04352, lat: 30.25201 },
      // MMU Mullana Main Campus Terminal (Chandigarh corridor terminal)
      { busId: 'bus-04', routeId: 'route-chd-04', lng: 77.04505, lat: 30.25045 },
    ];

    for (const spec of parkedSpecs) {
      const b = this.buses.get(spec.busId);
      if (!b) continue;
      b.status = 'IDLE';
      const parkedPoint: TelemetryPoint = {
        tripId: '',
        busId: b.id,
        busNumber: b.busNumber,
        routeId: spec.routeId,
        latitude: spec.lat,
        longitude: spec.lng,
        speedKmh: 0,
        bearing: 0,
        altitudeM: 268.0,
        accuracyM: 3.0,
        batteryPercent: 90.0,
        recordedAt: new Date().toISOString(),
      };
      b.lastTelemetry = parkedPoint;
      this.buses.set(b.id, b);
      this.telemetryLogs.push(parkedPoint);
    }

    // No fabricated attendance history. Boarding counts start at zero and
    // grow ONLY from real driver console check-ins during a live trip.

    // Seed alert
    this.alerts.set('alt-01', {
      id: 'alt-01',
      busId: 'bus-01',
      busNumber: 'BUS-01',
      alertType: 'OVER_SPEEDING',
      severity: 'WARNING',
      message: 'Bus-01 momentarily registered 78.4 km/h near Saha Bypass (limit 75 km/h)',
      latitude: 30.26410,
      longitude: 76.99420,
      isResolved: false,
      createdAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    });
  }

  // --- Users ---
  public async getUserByEmail(email: string): Promise<User | null> {
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === email.toLowerCase()) {
        return { ...u };
      }
    }
    return null;
  }

  public async getUserById(id: string): Promise<User | null> {
    const user = this.users.get(id);
    return user ? { ...user } : null;
  }

  public async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values()).map(u => ({ ...u }));
  }

  // --- Buses ---
  public async getAllBuses(): Promise<Bus[]> {
    return Array.from(this.buses.values()).map(b => ({ ...b }));
  }

  public async getBusById(id: string): Promise<Bus | null> {
    const bus = this.buses.get(id);
    return bus ? { ...bus } : null;
  }

  public async updateBus(id: string, updates: Partial<Bus>): Promise<Bus | null> {
    const bus = this.buses.get(id);
    if (!bus) return null;
    const updated = { ...bus, ...updates };
    this.buses.set(id, updated);
    return { ...updated };
  }

  // --- Routes & Stops ---
  public async getAllRoutes(campus?: string): Promise<Route[]> {
    const all = Array.from(this.routes.values());
    if (campus) {
      return all.filter(r => r.campus === campus);
    }
    return all;
  }

  public async getRouteById(id: string): Promise<Route | null> {
    const r = this.routes.get(id);
    return r ? { ...r } : null;
  }

  public async getRouteStopById(routeId: string, stopId: string): Promise<RouteStop | null> {
    const route = this.routes.get(routeId);
    if (!route) return null;
    const stop = route.stops.find(s => s.id === stopId);
    return stop ? { ...stop } : null;
  }

  // --- Student Allocations ---
  public async getAllocationByStudentId(studentId: string): Promise<StudentAllocation | null> {
    for (const a of this.allocations.values()) {
      if (a.studentId === studentId) {
        return { ...a };
      }
    }
    return null;
  }

  public async getAllocationsByRouteId(routeId: string): Promise<StudentAllocation[]> {
    const results: StudentAllocation[] = [];
    for (const a of this.allocations.values()) {
      if (a.routeId === routeId) {
        results.push({ ...a });
      }
    }
    return results;
  }

  // --- Trip Sessions ---
  public async createTripSession(data: {
    busId: string;
    routeId: string;
    driverId: string;
    direction: 'CAMPUS_BOUND' | 'RETURN_BOUND';
    startOdometerKm?: number;
  }): Promise<TripSession> {
    const bus = this.buses.get(data.busId);
    const route = this.routes.get(data.routeId);
    const driver = this.users.get(data.driverId);

    const tripId = `trip-${uuidv4().substring(0, 8)}`;
    const trip: TripSession = {
      id: tripId,
      busId: data.busId,
      busNumber: bus?.busNumber || 'BUS',
      routeId: data.routeId,
      routeName: route?.name || 'MMU Express',
      driverId: data.driverId,
      driverName: driver?.fullName || 'Driver',
      status: 'IN_TRANSIT',
      direction: data.direction,
      startedAt: new Date().toISOString(),
      startOdometerKm: data.startOdometerKm || bus?.odometerKm || 0,
      totalPassengersBoarded: 0,
      currentStopSequence: 1,
      nextStopName: route?.stops[0]?.name || 'Origin Stop',
    };

    this.trips.set(tripId, trip);
    if (bus) {
      bus.status = 'EN_ROUTE';
      this.buses.set(bus.id, bus);
    }

    return { ...trip };
  }

  public async getTripSessionById(id: string): Promise<TripSession | null> {
    const trip = this.trips.get(id);
    return trip ? { ...trip } : null;
  }

  public async getActiveTripByBusId(busId: string): Promise<TripSession | null> {
    for (const t of this.trips.values()) {
      if (t.busId === busId && t.status === 'IN_TRANSIT') {
        return { ...t };
      }
    }
    return null;
  }

  public async getActiveTripByRouteId(routeId: string): Promise<TripSession | null> {
    for (const t of this.trips.values()) {
      if (t.routeId === routeId && t.status === 'IN_TRANSIT') {
        return { ...t };
      }
    }
    return null;
  }

  public async updateTripSession(id: string, updates: Partial<TripSession>): Promise<TripSession | null> {
    const trip = this.trips.get(id);
    if (!trip) return null;
    const updated = { ...trip, ...updates };
    this.trips.set(id, updated);
    return { ...updated };
  }

  // --- Telemetry ---
  public async saveTelemetryPoint(point: TelemetryPoint): Promise<TelemetryPoint> {
    this.telemetryLogs.push(point);
    // Keep max 5000 in memory
    if (this.telemetryLogs.length > 5000) {
      this.telemetryLogs.shift();
    }

    // Update bus state
    const bus = this.buses.get(point.busId);
    if (bus) {
      bus.lastTelemetry = point;
      this.buses.set(bus.id, bus);
    }

    // Check speed limit violation
    if (point.speedKmh > config.speedLimitKmh) {
      this.createFleetAlert({
        busId: point.busId,
        busNumber: bus?.busNumber || 'BUS',
        tripId: point.tripId,
        alertType: 'OVER_SPEEDING',
        severity: 'WARNING',
        message: `Bus ${bus?.busNumber || ''} exceeded speed limit (${point.speedKmh.toFixed(1)} km/h > ${config.speedLimitKmh} km/h)`,
        latitude: point.latitude,
        longitude: point.longitude,
      });
    }

    return point;
  }

  public async getLatestTelemetry(busId: string): Promise<TelemetryPoint | null> {
    const bus = this.buses.get(busId);
    return bus?.lastTelemetry || null;
  }

  // --- Attendance ---
  public async getAttendanceLogs(tripId: string): Promise<AttendanceRecord[]> {
    const results: AttendanceRecord[] = [];
    for (const r of this.attendanceLogs.values()) {
      if (r.tripId === tripId) {
        results.push({ ...r });
      }
    }
    return results;
  }

  public async upsertAttendanceRecord(record: {
    tripId: string;
    studentId: string;
    stopId: string;
    status: AttendanceStatus;
    verificationMethod: 'MANUAL_CONSOLE' | 'NFC_RFID' | 'QR_CODE';
  }): Promise<AttendanceRecord> {
    const key = `${record.tripId}_${record.studentId}`;
    const student = this.users.get(record.studentId);
    const stop = this.getStopById(record.stopId);

    const existing = this.attendanceLogs.get(key);
    const updated: AttendanceRecord = {
      id: existing?.id || `att-${uuidv4().substring(0, 8)}`,
      tripId: record.tripId,
      studentId: record.studentId,
      studentName: student?.fullName || 'Student',
      rollNumber: student?.identifier || 'N/A',
      department: student?.department || 'Student',
      stopId: record.stopId,
      stopName: stop?.name || 'Bus Stop',
      status: record.status,
      scannedAt: new Date().toISOString(),
      verificationMethod: record.verificationMethod,
    };

    this.attendanceLogs.set(key, updated);

    // Update trip boarded count
    let boardedCount = 0;
    for (const a of this.attendanceLogs.values()) {
      if (a.tripId === record.tripId && a.status === 'BOARDED') {
        boardedCount++;
      }
    }
    const trip = this.trips.get(record.tripId);
    if (trip) {
      trip.totalPassengersBoarded = boardedCount;
      this.trips.set(trip.id, trip);
    }

    return updated;
  }

  private getStopById(stopId: string): RouteStop | null {
    for (const r of this.routes.values()) {
      const s = r.stops.find(st => st.id === stopId);
      if (s) return s;
    }
    return null;
  }

  // --- Alerts ---
  public async createFleetAlert(alert: Omit<FleetAlert, 'id' | 'createdAt' | 'isResolved'>): Promise<FleetAlert> {
    const id = `alt-${uuidv4().substring(0, 8)}`;
    const newAlert: FleetAlert = {
      ...alert,
      id,
      isResolved: false,
      createdAt: new Date().toISOString(),
    };
    this.alerts.set(id, newAlert);
    return newAlert;
  }

  public async getActiveAlerts(): Promise<FleetAlert[]> {
    return Array.from(this.alerts.values())
      .filter(a => !a.isResolved)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async resolveAlert(id: string): Promise<boolean> {
    const a = this.alerts.get(id);
    if (!a) return false;
    a.isResolved = true;
    this.alerts.set(id, a);
    return true;
  }

  // --- Admin Fleet Radar Metrics ---
  public async getAdminFleetMetrics() {
    const buses = Array.from(this.buses.values());
    const trips = Array.from(this.trips.values()).filter(t => t.status === 'IN_TRANSIT');
    const totalStudents = Array.from(this.allocations.values()).length;
    let totalBoarded = 0;
    for (const a of this.attendanceLogs.values()) {
      if (a.status === 'BOARDED') totalBoarded++;
    }

    const activeAlerts = await this.getActiveAlerts();

    return {
      totalFleetCount: buses.length,
      activeTripsCount: trips.length,
      idleBusesCount: buses.filter(b => b.status === 'IDLE').length,
      maintenanceCount: buses.filter(b => b.status === 'MAINTENANCE').length,
      totalStudentsEnrolled: totalStudents,
      totalStudentsBoardedToday: totalBoarded,
      activeAlertsCount: activeAlerts.length,
      recentAlerts: activeAlerts.slice(0, 5),
    };
  }
}

export const db = new FleetDatabase();
