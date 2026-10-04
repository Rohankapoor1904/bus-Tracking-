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
import {
  FleetRepository,
  CreateTripInput,
  UpsertAttendanceInput,
  AdminFleetMetrics,
} from './repository.js';
import {
  SEED_USERS,
  SEED_ROUTES,
  SEED_BUSES,
  SEED_ALLOCATIONS,
} from './seeds.js';

export class InMemoryFleetRepository implements FleetRepository {
  private users: User[] = [];
  private buses: Bus[] = [];
  private routes: Route[] = [];
  private allocations: StudentAllocation[] = [];
  private trips: TripSession[] = [];
  private telemetry: Map<string, TelemetryPoint> = new Map();
  private attendance: AttendanceRecord[] = [];
  private alerts: FleetAlert[] = [];

  async init(): Promise<void> {
    this.users = JSON.parse(JSON.stringify(SEED_USERS));
    this.buses = JSON.parse(JSON.stringify(SEED_BUSES));
    this.routes = JSON.parse(JSON.stringify(SEED_ROUTES));
    this.allocations = JSON.parse(JSON.stringify(SEED_ALLOCATIONS));
  }

  async close(): Promise<void> {}

  // Users
  async getUserByEmail(email: string): Promise<User | null> {
    const norm = email.trim().toLowerCase();
    return this.users.find((u) => u.email.toLowerCase() === norm) || null;
  }

  async getUserById(id: string): Promise<User | null> {
    return this.users.find((u) => u.id === id) || null;
  }

  async getAllUsers(): Promise<User[]> {
    return [...this.users];
  }

  // Buses
  async getAllBuses(): Promise<Bus[]> {
    return [...this.buses];
  }

  async getBusById(id: string): Promise<Bus | null> {
    return this.buses.find((b) => b.id === id) || null;
  }

  async updateBus(id: string, updates: Partial<Bus>): Promise<Bus | null> {
    const idx = this.buses.findIndex((b) => b.id === id);
    if (idx < 0) return null;
    this.buses[idx] = { ...this.buses[idx], ...updates };
    return this.buses[idx];
  }

  // Routes
  async getAllRoutes(campus?: string): Promise<Route[]> {
    if (campus) {
      return this.routes.filter((r) => r.campus === campus);
    }
    return [...this.routes];
  }

  async getRouteById(id: string): Promise<Route | null> {
    return this.routes.find((r) => r.id === id) || null;
  }

  async getRouteStopById(routeId: string, stopId: string): Promise<RouteStop | null> {
    const route = await this.getRouteById(routeId);
    if (!route) return null;
    return route.stops.find((s) => s.id === stopId) || null;
  }

  // Allocations
  async getAllocationByStudentId(studentId: string): Promise<StudentAllocation | null> {
    return this.allocations.find((a) => a.studentId === studentId) || null;
  }

  async getAllocationsByRouteId(routeId: string): Promise<StudentAllocation[]> {
    return this.allocations.filter((a) => a.routeId === routeId);
  }

  // Trips
  async createTripSession(data: CreateTripInput): Promise<TripSession> {
    const bus = await this.getBusById(data.busId);
    const route = await this.getRouteById(data.routeId);
    const driver = await this.getUserById(data.driverId);

    const trip: TripSession = {
      id: `trip-${Date.now()}`,
      busId: data.busId,
      busNumber: bus?.busNumber || 'BUS-01',
      routeId: data.routeId,
      routeName: route?.name || 'MMU Line',
      driverId: data.driverId,
      driverName: driver?.fullName || 'Driver',
      status: 'IN_TRANSIT',
      direction: data.direction,
      startedAt: new Date().toISOString(),
      startOdometerKm: data.startOdometerKm,
      totalPassengersBoarded: 0,
      currentStopSequence: 1,
      nextStopName: route?.stops[0]?.name || 'Origin Station',
      distanceToNextStopMeters: 500,
      etaMinutesToNextStop: 2,
    };

    this.trips.push(trip);
    await this.updateBus(data.busId, { status: 'EN_ROUTE' });
    return trip;
  }

  async getTripSessionById(id: string): Promise<TripSession | null> {
    return this.trips.find((t) => t.id === id) || null;
  }

  async getActiveTripByBusId(busId: string): Promise<TripSession | null> {
    return this.trips.find((t) => t.busId === busId && t.status === 'IN_TRANSIT') || null;
  }

  async getActiveTripByRouteId(routeId: string): Promise<TripSession | null> {
    return this.trips.find((t) => t.routeId === routeId && t.status === 'IN_TRANSIT') || null;
  }

  async updateTripSession(id: string, updates: Partial<TripSession>): Promise<TripSession | null> {
    const idx = this.trips.findIndex((t) => t.id === id);
    if (idx < 0) return null;
    this.trips[idx] = { ...this.trips[idx], ...updates };
    return this.trips[idx];
  }

  // Telemetry
  async saveTelemetryPoint(point: TelemetryPoint): Promise<TelemetryPoint> {
    this.telemetry.set(point.busId, point);
    return point;
  }

  async getLatestTelemetry(busId: string): Promise<TelemetryPoint | null> {
    return this.telemetry.get(busId) || null;
  }

  // Attendance
  async getAttendanceLogs(tripId: string): Promise<AttendanceRecord[]> {
    return this.attendance.filter((a) => a.tripId === tripId);
  }

  async upsertAttendanceRecord(record: UpsertAttendanceInput): Promise<AttendanceRecord> {
    const student = await this.getUserById(record.studentId);
    const newRecord: AttendanceRecord = {
      id: `att-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      tripId: record.tripId,
      studentId: record.studentId,
      studentName: student?.fullName || 'Student',
      rollNumber: student?.identifier || '11221001',
      department: student?.department || 'B.Tech',
      stopId: record.stopId,
      stopName: 'Bus Stop',
      status: record.status,
      scannedAt: new Date().toISOString(),
      verificationMethod: record.verificationMethod,
    };

    this.attendance.push(newRecord);
    if (record.status === 'BOARDED') {
      const trip = await this.getTripSessionById(record.tripId);
      if (trip) {
        await this.updateTripSession(trip.id, {
          totalPassengersBoarded: (trip.totalPassengersBoarded || 0) + 1,
        });
      }
    }
    return newRecord;
  }

  // Alerts
  async createFleetAlert(alert: Omit<FleetAlert, 'id' | 'createdAt' | 'isResolved'>): Promise<FleetAlert> {
    const newAlert: FleetAlert = {
      ...alert,
      id: `alt-${Date.now()}`,
      isResolved: false,
      createdAt: new Date().toISOString(),
    };
    this.alerts.unshift(newAlert);
    return newAlert;
  }

  async getActiveAlerts(): Promise<FleetAlert[]> {
    return this.alerts.filter((a) => !a.isResolved);
  }

  async resolveAlert(id: string): Promise<boolean> {
    const alert = this.alerts.find((a) => a.id === id);
    if (!alert) return false;
    alert.isResolved = true;
    return true;
  }

  // Admin Metrics
  async getAdminFleetMetrics(): Promise<AdminFleetMetrics> {
    const buses = await this.getAllBuses();
    const activeTrips = this.trips.filter((t) => t.status === 'IN_TRANSIT');
    const totalBoarded = activeTrips.reduce((acc, t) => acc + (t.totalPassengersBoarded || 0), 0);
    const activeAlerts = await this.getActiveAlerts();

    return {
      totalFleetCount: buses.length,
      activeTripsCount: activeTrips.length,
      idleBusesCount: buses.length - activeTrips.length,
      maintenanceCount: 0,
      totalStudentsEnrolled: this.allocations.length,
      totalStudentsBoardedToday: totalBoarded,
      activeAlertsCount: activeAlerts.length,
      recentAlerts: activeAlerts.slice(0, 5),
    };
  }

  // Drivers Management
  private drivers: any[] = [
    {
      id: 'drv-01',
      fullName: 'Rajesh Kumar Sharma',
      phone: '+91-9876543210',
      licenseNumber: 'HR-04-2015-0045129',
      assignedBusId: 'bus-01',
      assignedBusNumber: 'BUS-01',
      assignedRouteId: 'route-amb-01',
      assignedRouteName: 'Ambala Cantt - MMU Mullana Express',
      status: 'ACTIVE',
      experienceYears: 12,
      emergencyContact: '+91-9876543299',
    },
    {
      id: 'drv-02',
      fullName: 'Gurpreet Singh Saini',
      phone: '+91-9876543211',
      licenseNumber: 'HR-02-2018-0091823',
      assignedBusId: 'bus-02',
      assignedBusNumber: 'BUS-02',
      assignedRouteId: 'route-ynr-02',
      assignedRouteName: 'Yamunanagar & Jagadhri Line',
      status: 'ACTIVE',
      experienceYears: 9,
      emergencyContact: '+91-9876543298',
    },
    {
      id: 'drv-03',
      fullName: 'Amit Verma',
      phone: '+91-9876543212',
      licenseNumber: 'HR-07-2016-0033104',
      assignedBusId: 'bus-03',
      assignedBusNumber: 'BUS-03',
      assignedRouteId: 'route-kkr-03',
      assignedRouteName: 'Kurukshetra & Shahbad Route',
      status: 'ACTIVE',
      experienceYears: 14,
      emergencyContact: '+91-9876543297',
    },
    {
      id: 'drv-04',
      fullName: 'Satish Chand Chauhan',
      phone: '+91-9876543213',
      licenseNumber: 'CH-01-2014-0019283',
      assignedBusId: 'bus-04',
      assignedBusNumber: 'BUS-04',
      assignedRouteId: 'route-chd-04',
      assignedRouteName: 'Chandigarh / Zirakpur - MMU Sadopur',
      status: 'ACTIVE',
      experienceYears: 16,
      emergencyContact: '+91-9876543296',
    },
  ];

  async getAllDrivers(): Promise<any[]> {
    return [...this.drivers];
  }

  async saveDriver(driver: any): Promise<any> {
    const idx = this.drivers.findIndex((d) => d.id === driver.id);
    if (idx >= 0) {
      this.drivers[idx] = { ...this.drivers[idx], ...driver };
      return this.drivers[idx];
    }
    const newDriver = { ...driver, id: driver.id || `drv-${Date.now()}` };
    this.drivers.push(newDriver);
    return newDriver;
  }

  async deleteDriver(id: string): Promise<boolean> {
    const initialLen = this.drivers.length;
    this.drivers = this.drivers.filter((d) => d.id !== id);
    return this.drivers.length < initialLen;
  }
}
