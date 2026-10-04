import {
  User,
  UserRole,
  Bus,
  Route,
  RouteStop,
  StudentAllocation,
  TripSession,
  TelemetryPoint,
  AttendanceRecord,
  AttendanceStatus,
  FleetAlert,
} from '../types/index.js';

export interface CreateTripInput {
  busId: string;
  routeId: string;
  driverId: string;
  direction: 'CAMPUS_BOUND' | 'RETURN_BOUND';
  startOdometerKm?: number;
}

export interface UpsertAttendanceInput {
  tripId: string;
  studentId: string;
  stopId: string;
  status: AttendanceStatus;
  verificationMethod: 'MANUAL_CONSOLE' | 'NFC_RFID' | 'QR_CODE';
}

export interface AdminFleetMetrics {
  totalFleetCount: number;
  activeTripsCount: number;
  idleBusesCount: number;
  maintenanceCount: number;
  totalStudentsEnrolled: number;
  totalStudentsBoardedToday: number;
  activeAlertsCount: number;
  recentAlerts: FleetAlert[];
}

/**
 * Persistence contract for the MMU fleet system. Implemented by the
 * PostgreSQL + PostGIS repository. Kept async so it maps cleanly to SQL
 * and allows swapping in a test double.
 */
export interface FleetRepository {
  init(): Promise<void>;
  close(): Promise<void>;

  getUserByEmail(email: string): Promise<User | null>;
  getUserById(id: string): Promise<User | null>;
  getAllUsers(): Promise<User[]>;

  getAllBuses(): Promise<Bus[]>;
  getBusById(id: string): Promise<Bus | null>;
  updateBus(id: string, updates: Partial<Bus>): Promise<Bus | null>;

  getAllRoutes(campus?: string): Promise<Route[]>;
  getRouteById(id: string): Promise<Route | null>;
  getRouteStopById(routeId: string, stopId: string): Promise<RouteStop | null>;

  getAllocationByStudentId(studentId: string): Promise<StudentAllocation | null>;
  getAllocationsByRouteId(routeId: string): Promise<StudentAllocation[]>;

  createTripSession(data: CreateTripInput): Promise<TripSession>;
  getTripSessionById(id: string): Promise<TripSession | null>;
  getActiveTripByBusId(busId: string): Promise<TripSession | null>;
  getActiveTripByRouteId(routeId: string): Promise<TripSession | null>;
  updateTripSession(id: string, updates: Partial<TripSession>): Promise<TripSession | null>;

  saveTelemetryPoint(point: TelemetryPoint): Promise<TelemetryPoint>;
  getLatestTelemetry(busId: string): Promise<TelemetryPoint | null>;

  getAttendanceLogs(tripId: string): Promise<AttendanceRecord[]>;
  upsertAttendanceRecord(record: UpsertAttendanceInput): Promise<AttendanceRecord>;

  createFleetAlert(
    alert: Omit<FleetAlert, 'id' | 'createdAt' | 'isResolved'>
  ): Promise<FleetAlert>;
  getActiveAlerts(): Promise<FleetAlert[]>;
  resolveAlert(id: string): Promise<boolean>;

  getAdminFleetMetrics(): Promise<AdminFleetMetrics>;

  getAllDrivers(): Promise<any[]>;
  saveDriver(driver: any): Promise<any>;
  deleteDriver(id: string): Promise<boolean>;
}

export type { UserRole };
