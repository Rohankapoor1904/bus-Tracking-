import { PostgresFleetRepository } from './postgres-repository.js';
import { InMemoryFleetRepository } from './in-memory-repository.js';
import type {
  FleetRepository,
  CreateTripInput,
  UpsertAttendanceInput,
  AdminFleetMetrics,
} from './repository.js';
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
} from '../types/index.js';

class ResilientFleetRepository implements FleetRepository {
  private activeRepo: FleetRepository;

  constructor() {
    this.activeRepo = new PostgresFleetRepository();
  }

  async init(): Promise<void> {
    try {
      await this.activeRepo.init();
      console.log('[DB] Connected to PostgreSQL + PostGIS.');
    } catch (err: any) {
      console.warn(`[DB] PostgreSQL unavailable (${err.message}) — running in robust In-Memory Fleet mode.`);
      this.activeRepo = new InMemoryFleetRepository();
      await this.activeRepo.init();
    }
  }

  async close(): Promise<void> {
    await this.activeRepo.close();
  }

  getUserByEmail(email: string): Promise<User | null> {
    return this.activeRepo.getUserByEmail(email);
  }
  getUserById(id: string): Promise<User | null> {
    return this.activeRepo.getUserById(id);
  }
  getAllUsers(): Promise<User[]> {
    return this.activeRepo.getAllUsers();
  }

  getAllBuses(): Promise<Bus[]> {
    return this.activeRepo.getAllBuses();
  }
  getBusById(id: string): Promise<Bus | null> {
    return this.activeRepo.getBusById(id);
  }
  updateBus(id: string, updates: Partial<Bus>): Promise<Bus | null> {
    return this.activeRepo.updateBus(id, updates);
  }

  getAllRoutes(campus?: string): Promise<Route[]> {
    return this.activeRepo.getAllRoutes(campus);
  }
  getRouteById(id: string): Promise<Route | null> {
    return this.activeRepo.getRouteById(id);
  }
  getRouteStopById(routeId: string, stopId: string): Promise<RouteStop | null> {
    return this.activeRepo.getRouteStopById(routeId, stopId);
  }

  getAllocationByStudentId(studentId: string): Promise<StudentAllocation | null> {
    return this.activeRepo.getAllocationByStudentId(studentId);
  }
  getAllocationsByRouteId(routeId: string): Promise<StudentAllocation[]> {
    return this.activeRepo.getAllocationsByRouteId(routeId);
  }

  createTripSession(data: CreateTripInput): Promise<TripSession> {
    return this.activeRepo.createTripSession(data);
  }
  getTripSessionById(id: string): Promise<TripSession | null> {
    return this.activeRepo.getTripSessionById(id);
  }
  getActiveTripByBusId(busId: string): Promise<TripSession | null> {
    return this.activeRepo.getActiveTripByBusId(busId);
  }
  getActiveTripByRouteId(routeId: string): Promise<TripSession | null> {
    return this.activeRepo.getActiveTripByRouteId(routeId);
  }
  updateTripSession(id: string, updates: Partial<TripSession>): Promise<TripSession | null> {
    return this.activeRepo.updateTripSession(id, updates);
  }

  saveTelemetryPoint(point: TelemetryPoint): Promise<TelemetryPoint> {
    return this.activeRepo.saveTelemetryPoint(point);
  }
  getLatestTelemetry(busId: string): Promise<TelemetryPoint | null> {
    return this.activeRepo.getLatestTelemetry(busId);
  }

  getAttendanceLogs(tripId: string): Promise<AttendanceRecord[]> {
    return this.activeRepo.getAttendanceLogs(tripId);
  }
  upsertAttendanceRecord(record: UpsertAttendanceInput): Promise<AttendanceRecord> {
    return this.activeRepo.upsertAttendanceRecord(record);
  }

  createFleetAlert(alert: Omit<FleetAlert, 'id' | 'createdAt' | 'isResolved'>): Promise<FleetAlert> {
    return this.activeRepo.createFleetAlert(alert);
  }
  getActiveAlerts(): Promise<FleetAlert[]> {
    return this.activeRepo.getActiveAlerts();
  }
  resolveAlert(id: string): Promise<boolean> {
    return this.activeRepo.resolveAlert(id);
  }

  getAdminFleetMetrics(): Promise<AdminFleetMetrics> {
    return this.activeRepo.getAdminFleetMetrics();
  }

  getAllDrivers(): Promise<any[]> {
    return this.activeRepo.getAllDrivers();
  }
  saveDriver(driver: any): Promise<any> {
    return this.activeRepo.saveDriver(driver);
  }
  deleteDriver(id: string): Promise<boolean> {
    return this.activeRepo.deleteDriver(id);
  }
}

export const db: FleetRepository = new ResilientFleetRepository();
export type { FleetRepository };
