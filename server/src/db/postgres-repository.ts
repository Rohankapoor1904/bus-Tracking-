import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type pg from 'pg';
import { query, withTransaction, closePool, pool } from './client.js';
import {
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
  AttendanceStatus,
  FleetAlert,
  CampusLocation,
  UserRole,
  BusStatus,
  TripStatus,
} from '../types/index.js';
import {
  SEED_USERS,
  SEED_ROUTES,
  SEED_BUSES,
  SEED_ALLOCATIONS,
} from './seeds.js';
import { config } from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

// ---------------------------------------------------------------------------
// Row -> domain mappers
// ---------------------------------------------------------------------------
function mapUser(r: any): User {
  return {
    id: r.id,
    email: r.email,
    passwordHash: r.password_hash,
    role: r.role,
    fullName: r.full_name,
    identifier: r.identifier,
    phone: r.phone,
    avatarUrl: r.avatar_url ?? undefined,
    campus: r.campus,
    department: r.department ?? undefined,
    assignedBusId: r.assigned_bus_id ?? undefined,
    assignedRouteId: r.assigned_route_id ?? undefined,
    isActive: r.is_active,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

function mapBus(r: any): Bus {
  return {
    id: r.id,
    busNumber: r.bus_number,
    registrationNumber: r.registration_number,
    model: r.model,
    capacity: r.capacity,
    status: r.status,
    assignedDriverId: r.assigned_driver_id ?? undefined,
    assignedDriverName: r.assigned_driver_name ?? undefined,
    assignedDriverPhone: r.assigned_driver_phone ?? undefined,
    defaultRouteId: r.default_route_id ?? undefined,
    defaultRouteName: r.default_route_name ?? undefined,
    primaryCampus: r.primary_campus,
    fuelLevelPercent: num(r.fuel_level_percent),
    odometerKm: num(r.odometer_km),
    isActive: r.is_active,
  };
}

function mapStop(r: any): RouteStop {
  return {
    id: r.id,
    routeId: r.route_id,
    name: r.name,
    landmark: r.landmark,
    stopSequence: r.stop_sequence,
    latitude: num(r.latitude),
    longitude: num(r.longitude),
    geofenceRadiusMeters: r.geofence_radius_meters,
    scheduledArrivalOffsetMins: r.scheduled_arrival_offset_mins,
    isMajorHub: r.is_major_hub,
  };
}

function mapRoute(r: any, stops: RouteStop[]): Route {
  return {
    id: r.id,
    routeCode: r.route_code,
    name: r.name,
    description: r.description ?? '',
    originName: r.origin_name,
    destinationName: r.destination_name,
    totalDistanceKm: num(r.total_distance_km),
    estimatedDurationMinutes: r.estimated_duration_minutes,
    campus: r.campus,
    morningDepartureTime: r.morning_departure_time,
    eveningReturnTime: r.evening_return_time,
    colorHex: r.color_hex,
    stops,
    waypoints: (r.waypoints ?? []) as [number, number][],
    isActive: r.is_active,
  };
}

function mapAllocation(r: any): StudentAllocation {
  return {
    id: r.id,
    studentId: r.student_id,
    studentName: r.student_name ?? undefined,
    studentRoll: r.student_roll ?? undefined,
    department: r.department ?? undefined,
    phone: r.phone ?? undefined,
    routeId: r.route_id,
    routeName: r.route_name ?? undefined,
    assignedStopId: r.assigned_stop_id,
    assignedStopName: r.assigned_stop_name ?? undefined,
    busId: r.bus_id ?? undefined,
    busNumber: r.bus_number ?? undefined,
    academicSession: r.academic_session,
    passNumber: r.pass_number,
    seatNumber: r.seat_number ?? undefined,
    isValid: r.is_valid,
    feeStatus: r.fee_status,
  };
}

function mapTrip(r: any): TripSession {
  return {
    id: r.id,
    busId: r.bus_id,
    busNumber: r.bus_number,
    routeId: r.route_id,
    routeName: r.route_name,
    driverId: r.driver_id,
    driverName: r.driver_name,
    status: r.status,
    direction: r.direction,
    startedAt: r.started_at ? iso(r.started_at) : undefined,
    endedAt: r.ended_at ? iso(r.ended_at) : undefined,
    startOdometerKm: r.start_odometer_km != null ? num(r.start_odometer_km) : undefined,
    endOdometerKm: r.end_odometer_km != null ? num(r.end_odometer_km) : undefined,
    totalPassengersBoarded: r.total_passengers_boarded,
    currentStopSequence: r.current_stop_sequence,
    nextStopName: r.next_stop_name ?? undefined,
    distanceToNextStopMeters:
      r.distance_to_next_stop_meters != null ? Number(r.distance_to_next_stop_meters) : undefined,
    etaMinutesToNextStop:
      r.eta_minutes_to_next_stop != null ? num(r.eta_minutes_to_next_stop) : undefined,
  };
}

function mapTelemetry(r: any, busNumber?: string): TelemetryPoint {
  return {
    tripId: r.trip_id ?? '',
    busId: r.bus_id,
    busNumber: busNumber,
    routeId: undefined,
    latitude: num(r.latitude),
    longitude: num(r.longitude),
    speedKmh: num(r.speed_kmh),
    bearing: num(r.bearing),
    altitudeM: num(r.altitude_m ?? 0),
    accuracyM: num(r.accuracy_m ?? 5),
    batteryPercent: r.battery_percent != null ? num(r.battery_percent) : undefined,
    recordedAt: iso(r.recorded_at),
  };
}

function mapAttendance(r: any): AttendanceRecord {
  return {
    id: r.id,
    tripId: r.trip_id,
    studentId: r.student_id,
    studentName: r.student_name ?? 'Student',
    rollNumber: r.roll_number ?? 'N/A',
    department: r.department ?? 'Student',
    stopId: r.stop_id,
    stopName: r.stop_name ?? 'Bus Stop',
    status: r.status,
    scannedAt: r.scanned_at ? iso(r.scanned_at) : undefined,
    verificationMethod: r.verification_method,
  };
}

function mapAlert(r: any, busNumber: string): FleetAlert {
  return {
    id: r.id,
    tripId: r.trip_id ?? undefined,
    busId: r.bus_id,
    busNumber,
    alertType: r.alert_type,
    severity: r.severity,
    message: r.message,
    latitude: r.latitude != null ? num(r.latitude) : undefined,
    longitude: r.longitude != null ? num(r.longitude) : undefined,
    isResolved: r.is_resolved,
    createdAt: iso(r.created_at),
  };
}

const iso = (v: any): string => (v instanceof Date ? v.toISOString() : String(v));
const num = (v: any): number => (v == null ? 0 : Number(v));

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------
export class PostgresFleetRepository implements FleetRepository {
  async init(): Promise<void> {
    const schema = fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf-8');
    await query(schema);
    await this.seedIfEmpty();
  }

  async close(): Promise<void> {
    await closePool();
  }

  // --- seeding -------------------------------------------------------------
  private async seedIfEmpty(): Promise<void> {
    const { rows } = await query<{ count: string }>('SELECT COUNT(*)::int AS count FROM users');
    if (Number(rows[0].count) > 0) return;

    await withTransaction(async (client) => {
      for (const u of SEED_USERS) {
        await client.query(
          `INSERT INTO users (id, email, password_hash, role, full_name, identifier, phone,
             campus, department, assigned_bus_id, assigned_route_id, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT (id) DO NOTHING`,
          [
            u.id, u.email, u.passwordHash, u.role, u.fullName, u.identifier, u.phone,
            u.campus, u.department ?? null, u.assignedBusId ?? null,
            u.assignedRouteId ?? null, u.isActive,
          ]
        );
      }

      for (const route of SEED_ROUTES) {
        const wkt =
          route.waypoints.length > 1
            ? `LINESTRING(${route.waypoints.map(([lng, lat]) => `${lng} ${lat}`).join(', ')})`
            : null;
        await client.query(
          `INSERT INTO routes (id, route_code, name, description, origin_name, destination_name,
             total_distance_km, estimated_duration_minutes, campus, morning_departure_time,
             evening_return_time, color_hex, is_active, waypoints, route_polyline)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
             CASE WHEN $15::text IS NULL THEN NULL ELSE ST_GeomFromText($15, 4326) END)
           ON CONFLICT (id) DO NOTHING`,
          [
            route.id, route.routeCode, route.name, route.description, route.originName,
            route.destinationName, route.totalDistanceKm, route.estimatedDurationMinutes,
            route.campus, route.morningDepartureTime, route.eveningReturnTime, route.colorHex,
            route.isActive, JSON.stringify(route.waypoints), wkt,
          ]
        );

        for (const s of route.stops) {
          await client.query(
            `INSERT INTO route_stops (id, route_id, name, landmark, stop_sequence, latitude,
               longitude, geofence_radius_meters, scheduled_arrival_offset_mins, is_major_hub)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             ON CONFLICT (id) DO NOTHING`,
            [
              s.id, s.routeId, s.name, s.landmark, s.stopSequence, s.latitude, s.longitude,
              s.geofenceRadiusMeters, s.scheduledArrivalOffsetMins, s.isMajorHub,
            ]
          );
        }
      }

      for (const b of SEED_BUSES) {
        await client.query(
          `INSERT INTO buses (id, bus_number, registration_number, model, capacity, status,
             assigned_driver_id, default_route_id, primary_campus, fuel_level_percent, odometer_km, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT (id) DO NOTHING`,
          [
            b.id, b.busNumber, b.registrationNumber, b.model, b.capacity, b.status,
            b.assignedDriverId ?? null, b.defaultRouteId ?? null, b.primaryCampus,
            b.fuelLevelPercent, b.odometerKm, b.isActive,
          ]
        );
      }

      for (const a of SEED_ALLOCATIONS) {
        await client.query(
          `INSERT INTO student_bus_allocations (id, student_id, route_id, assigned_stop_id, bus_id,
             academic_session, pass_number, seat_number, is_valid, fee_status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (id) DO NOTHING`,
          [
            a.id, a.studentId, a.routeId, a.assignedStopId, a.busId ?? null,
            a.academicSession, a.passNumber, a.seatNumber ?? null, a.isValid, a.feeStatus,
          ]
        );
      }

      // Parked terminal fixes (no fabricated movement)
      const parked: { busId: string; routeId: string; lng: number; lat: number }[] = [
        { busId: 'bus-01', routeId: 'route-amb-01', lng: 77.04402, lat: 30.24853 },
        { busId: 'bus-02', routeId: 'route-ynr-02', lng: 77.04402, lat: 30.24853 },
        { busId: 'bus-03', routeId: 'route-kkr-03', lng: 77.04352, lat: 30.25201 },
        { busId: 'bus-04', routeId: 'route-chd-04', lng: 77.04505, lat: 30.25045 },
      ];
      for (const p of parked) {
        await client.query(
          `INSERT INTO live_telemetry (bus_id, latitude, longitude, speed_kmh, bearing,
             altitude_m, accuracy_m, battery_percent, recorded_at)
           VALUES ($1,$2,$3, 0, 0, 268, 3, 90, $4)`,
          [p.busId, p.lat, p.lng, new Date().toISOString()]
        );
      }

      // Seed operational alert
      await client.query(
        `INSERT INTO fleet_alerts (id, bus_id, alert_type, severity, message, latitude, longitude, is_resolved, created_at)
         VALUES ($1,$2,'OVER_SPEEDING','WARNING',$3,30.26410,76.99420,false,$4)
         ON CONFLICT (id) DO NOTHING`,
        [
          'alt-seed-01',
          'bus-01',
          'Bus-01 momentarily registered 78.4 km/h near Saha Bypass (limit 75 km/h)',
          new Date(Date.now() - 12 * 60 * 1000).toISOString(),
        ]
      );
    });

    console.log('[DB] Seeded MMU fleet reference data (users, routes, stops, buses, allocations).');
  }

  // --- users ---------------------------------------------------------------
  async getUserByEmail(email: string): Promise<User | null> {
    const { rows } = await query('SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1', [email]);
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async getUserById(id: string): Promise<User | null> {
    const { rows } = await query('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async getAllUsers(): Promise<User[]> {
    const { rows } = await query('SELECT * FROM users ORDER BY role, full_name');
    return rows.map(mapUser);
  }

  // --- buses ---------------------------------------------------------------
  private busSelect(): string {
    return `SELECT b.*, d.full_name AS assigned_driver_name, d.phone AS assigned_driver_phone,
                   r.name AS default_route_name
            FROM buses b
            LEFT JOIN users d ON d.id = b.assigned_driver_id
            LEFT JOIN routes r ON r.id = b.default_route_id`;
  }

  async getAllBuses(): Promise<Bus[]> {
    const { rows } = await query(`${this.busSelect()} ORDER BY b.bus_number`);
    return rows.map(mapBus);
  }

  async getBusById(id: string): Promise<Bus | null> {
    const { rows } = await query(`${this.busSelect()} WHERE b.id = $1 LIMIT 1`, [id]);
    return rows[0] ? mapBus(rows[0]) : null;
  }

  async updateBus(id: string, updates: Partial<Bus>): Promise<Bus | null> {
    const map: Record<string, string> = {
      busNumber: 'bus_number',
      registrationNumber: 'registration_number',
      model: 'model',
      capacity: 'capacity',
      status: 'status',
      assignedDriverId: 'assigned_driver_id',
      defaultRouteId: 'default_route_id',
      primaryCampus: 'primary_campus',
      fuelLevelPercent: 'fuel_level_percent',
      odometerKm: 'odometer_km',
      isActive: 'is_active',
    };
    const sets: string[] = [];
    const params: any[] = [];
    for (const [k, col] of Object.entries(map)) {
      if ((updates as any)[k] !== undefined) {
        params.push((updates as any)[k]);
        sets.push(`${col} = $${params.length}`);
      }
    }
    if (sets.length === 0) return this.getBusById(id);
    params.push(id);
    await query(`UPDATE buses SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    return this.getBusById(id);
  }

  // --- routes --------------------------------------------------------------
  private async loadStops(routeId: string): Promise<RouteStop[]> {
    const { rows } = await query(
      'SELECT * FROM route_stops WHERE route_id = $1 ORDER BY stop_sequence',
      [routeId]
    );
    return rows.map(mapStop);
  }

  async getAllRoutes(campus?: string): Promise<Route[]> {
    const { rows } = campus
      ? await query('SELECT * FROM routes WHERE campus = $1 ORDER BY route_code', [campus])
      : await query('SELECT * FROM routes ORDER BY route_code');
    return Promise.all(rows.map(async (r) => mapRoute(r, await this.loadStops(r.id))));
  }

  async getRouteById(id: string): Promise<Route | null> {
    const { rows } = await query('SELECT * FROM routes WHERE id = $1 LIMIT 1', [id]);
    if (!rows[0]) return null;
    return mapRoute(rows[0], await this.loadStops(id));
  }

  async getRouteStopById(routeId: string, stopId: string): Promise<RouteStop | null> {
    const { rows } = await query(
      'SELECT * FROM route_stops WHERE route_id = $1 AND id = $2 LIMIT 1',
      [routeId, stopId]
    );
    return rows[0] ? mapStop(rows[0]) : null;
  }

  // --- allocations ---------------------------------------------------------
  private allocationSelect(): string {
    return `SELECT a.*, u.full_name AS student_name, u.identifier AS student_roll,
                   u.department, u.phone, r.name AS route_name,
                   s.name AS assigned_stop_name, b.bus_number
            FROM student_bus_allocations a
            JOIN users u ON u.id = a.student_id
            JOIN routes r ON r.id = a.route_id
            JOIN route_stops s ON s.id = a.assigned_stop_id
            LEFT JOIN buses b ON b.id = a.bus_id`;
  }

  async getAllocationByStudentId(studentId: string): Promise<StudentAllocation | null> {
    const { rows } = await query(`${this.allocationSelect()} WHERE a.student_id = $1 LIMIT 1`, [studentId]);
    return rows[0] ? mapAllocation(rows[0]) : null;
  }

  async getAllocationsByRouteId(routeId: string): Promise<StudentAllocation[]> {
    const { rows } = await query(`${this.allocationSelect()} WHERE a.route_id = $1`, [routeId]);
    return rows.map(mapAllocation);
  }

  // --- trips ---------------------------------------------------------------
  private tripSelect(): string {
    return `SELECT t.*, b.bus_number, r.name AS route_name, d.full_name AS driver_name
            FROM trip_sessions t
            JOIN buses b ON b.id = t.bus_id
            JOIN routes r ON r.id = t.route_id
            JOIN users d ON d.id = t.driver_id`;
  }

  async createTripSession(data: CreateTripInput): Promise<TripSession> {
    const bus = await this.getBusById(data.busId);
    const route = await this.getRouteById(data.routeId);
    const tripId = `trip-${uuidv4().substring(0, 8)}`;

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO trip_sessions (id, bus_id, route_id, driver_id, status, direction,
           started_at, start_odometer_km, total_passengers_boarded, current_stop_sequence, next_stop_name)
         VALUES ($1,$2,$3,$4,'IN_TRANSIT',$5,$6,$7,0,1,$8)`,
        [
          tripId, data.busId, data.routeId, data.driverId, data.direction,
          new Date().toISOString(), data.startOdometerKm ?? bus?.odometerKm ?? 0,
          route?.stops[0]?.name ?? 'Origin Stop',
        ]
      );
      await client.query(`UPDATE buses SET status = 'EN_ROUTE' WHERE id = $1`, [data.busId]);
    });

    return (await this.getTripSessionById(tripId))!;
  }

  async getTripSessionById(id: string): Promise<TripSession | null> {
    const { rows } = await query(`${this.tripSelect()} WHERE t.id = $1 LIMIT 1`, [id]);
    return rows[0] ? mapTrip(rows[0]) : null;
  }

  async getActiveTripByBusId(busId: string): Promise<TripSession | null> {
    const { rows } = await query(
      `${this.tripSelect()} WHERE t.bus_id = $1 AND t.status = 'IN_TRANSIT'
       ORDER BY t.started_at DESC LIMIT 1`,
      [busId]
    );
    return rows[0] ? mapTrip(rows[0]) : null;
  }

  async getActiveTripByRouteId(routeId: string): Promise<TripSession | null> {
    const { rows } = await query(
      `${this.tripSelect()} WHERE t.route_id = $1 AND t.status = 'IN_TRANSIT'
       ORDER BY t.started_at DESC LIMIT 1`,
      [routeId]
    );
    return rows[0] ? mapTrip(rows[0]) : null;
  }

  async updateTripSession(id: string, updates: Partial<TripSession>): Promise<TripSession | null> {
    const map: Record<string, string> = {
      status: 'status',
      direction: 'direction',
      startedAt: 'started_at',
      endedAt: 'ended_at',
      startOdometerKm: 'start_odometer_km',
      endOdometerKm: 'end_odometer_km',
      totalPassengersBoarded: 'total_passengers_boarded',
      currentStopSequence: 'current_stop_sequence',
      nextStopName: 'next_stop_name',
      distanceToNextStopMeters: 'distance_to_next_stop_meters',
      etaMinutesToNextStop: 'eta_minutes_to_next_stop',
    };
    const sets: string[] = [];
    const params: any[] = [];
    for (const [k, col] of Object.entries(map)) {
      if ((updates as any)[k] !== undefined) {
        params.push((updates as any)[k]);
        sets.push(`${col} = $${params.length}`);
      }
    }
    if (sets.length === 0) return this.getTripSessionById(id);
    params.push(id);
    await query(`UPDATE trip_sessions SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    return this.getTripSessionById(id);
  }

  // --- telemetry -----------------------------------------------------------
  async saveTelemetryPoint(point: TelemetryPoint): Promise<TelemetryPoint> {
    try {
      await query(
        `INSERT INTO live_telemetry (trip_id, bus_id, latitude, longitude,
           speed_kmh, bearing, altitude_m, accuracy_m, battery_percent, recorded_at)
         VALUES ($1,$2,$3,$4, $5,$6,$7,$8,$9,$10)`,
        [
          UUID_RE.test(point.tripId) || point.tripId.startsWith('trip-')
            ? await this.nullableTripId(point.tripId)
            : null,
          point.busId, point.latitude, point.longitude, point.speedKmh, point.bearing,
          point.altitudeM, point.accuracyM, point.batteryPercent ?? null, point.recordedAt,
        ]
      );
    } catch (err: any) {
      // A stale/unknown tripId must never drop the live position fix.
      console.warn(`[Telemetry] Position persisted without trip link: ${err.message}`);
      await query(
        `INSERT INTO live_telemetry (trip_id, bus_id, latitude, longitude,
           speed_kmh, bearing, altitude_m, accuracy_m, battery_percent, recorded_at)
         VALUES (NULL,$1,$2,$3, $4,$5,$6,$7,$8,$9)`,
        [
          point.busId, point.latitude, point.longitude, point.speedKmh, point.bearing,
          point.altitudeM, point.accuracyM, point.batteryPercent ?? null, point.recordedAt,
        ]
      );
    }

    // Speed-limit safety alert
    if (point.speedKmh > config.speedLimitKmh) {
      const bus = await this.getBusById(point.busId);
      await this.createFleetAlert({
        busId: point.busId,
        busNumber: bus?.busNumber || 'BUS',
        tripId: (await this.nullableTripId(point.tripId)) ?? undefined,
        alertType: 'OVER_SPEEDING',
        severity: 'WARNING',
        message: `Bus ${bus?.busNumber || ''} exceeded speed limit (${point.speedKmh.toFixed(
          1
        )} km/h > ${config.speedLimitKmh} km/h)`,
        latitude: point.latitude,
        longitude: point.longitude,
      });
    }

    return point;
  }

  private async nullableTripId(tripId?: string): Promise<string | null> {
    if (!tripId) return null;
    const { rows } = await query('SELECT 1 FROM trip_sessions WHERE id = $1 LIMIT 1', [tripId]);
    return rows[0] ? tripId : null;
  }

  async getLatestTelemetry(busId: string): Promise<TelemetryPoint | null> {
    const { rows } = await query(
      `SELECT * FROM live_telemetry WHERE bus_id = $1 ORDER BY recorded_at DESC, id DESC LIMIT 1`,
      [busId]
    );
    if (!rows[0]) return null;
    const bus = await this.getBusById(busId);
    return mapTelemetry(rows[0], bus?.busNumber);
  }

  // --- attendance ----------------------------------------------------------
  private attendanceSelect(): string {
    return `SELECT a.*, u.full_name AS student_name, u.identifier AS roll_number, u.department,
                   s.name AS stop_name
            FROM student_attendance_logs a
            JOIN users u ON u.id = a.student_id
            JOIN route_stops s ON s.id = a.stop_id`;
  }

  async getAttendanceLogs(tripId: string): Promise<AttendanceRecord[]> {
    const { rows } = await query(`${this.attendanceSelect()} WHERE a.trip_id = $1`, [tripId]);
    return rows.map(mapAttendance);
  }

  async upsertAttendanceRecord(record: UpsertAttendanceInput): Promise<AttendanceRecord> {
    // Enforce referential integrity: reject unknown trips/stops instead of
    // silently creating orphan attendance rows.
    const trip = await this.getTripSessionById(record.tripId);
    if (!trip) throw new Error(`Trip ${record.tripId} not found`);
    const student = await this.getUserById(record.studentId);
    if (!student) throw new Error(`Student ${record.studentId} not found`);

    const id = `att-${uuidv4().substring(0, 8)}`;
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO student_attendance_logs (id, trip_id, student_id, stop_id, status,
           scanned_at, verification_method)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (trip_id, student_id) DO UPDATE SET
           stop_id = EXCLUDED.stop_id,
           status = EXCLUDED.status,
           scanned_at = EXCLUDED.scanned_at,
           verification_method = EXCLUDED.verification_method`,
        [
          id, record.tripId, record.studentId, record.stopId, record.status,
          new Date().toISOString(), record.verificationMethod,
        ]
      );

      const { rows } = await client.query<{ count: string }>(
        `SELECT COUNT(*)::int AS count FROM student_attendance_logs
         WHERE trip_id = $1 AND status = 'BOARDED'`,
        [record.tripId]
      );
      await client.query(
        `UPDATE trip_sessions SET total_passengers_boarded = $1 WHERE id = $2`,
        [Number(rows[0].count), record.tripId]
      );
    });

    const { rows } = await query(
      `${this.attendanceSelect()} WHERE a.trip_id = $1 AND a.student_id = $2 LIMIT 1`,
      [record.tripId, record.studentId]
    );
    return mapAttendance(rows[0]);
  }

  // --- alerts --------------------------------------------------------------
  async createFleetAlert(
    alert: Omit<FleetAlert, 'id' | 'createdAt' | 'isResolved'>
  ): Promise<FleetAlert> {
    const id = `alt-${uuidv4().substring(0, 8)}`;
    await query(
      `INSERT INTO fleet_alerts (id, trip_id, bus_id, alert_type, severity, message,
         latitude, longitude, is_resolved, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,$9)`,
      [
        id, alert.tripId ?? null, alert.busId, alert.alertType, alert.severity, alert.message,
        alert.latitude ?? null, alert.longitude ?? null, new Date().toISOString(),
      ]
    );
    return { ...alert, id, isResolved: false, createdAt: new Date().toISOString() };
  }

  async getActiveAlerts(): Promise<FleetAlert[]> {
    const { rows } = await query(
      `SELECT a.*, b.bus_number FROM fleet_alerts a
       JOIN buses b ON b.id = a.bus_id
       WHERE a.is_resolved = false
       ORDER BY a.created_at DESC`
    );
    return rows.map((r) => mapAlert(r, r.bus_number));
  }

  async resolveAlert(id: string): Promise<boolean> {
    const { rowCount } = await query(
      `UPDATE fleet_alerts SET is_resolved = true, resolved_at = $1 WHERE id = $2 AND is_resolved = false`,
      [new Date().toISOString(), id]
    );
    return (rowCount ?? 0) > 0;
  }

  // --- metrics -------------------------------------------------------------
  async getAdminFleetMetrics(): Promise<AdminFleetMetrics> {
    const [buses, activeTrips, totalStudents, boarded, alerts] = await Promise.all([
      query<{ status: BusStatus }>('SELECT status FROM buses'),
      query<{ count: string }>(
        `SELECT COUNT(*)::int AS count FROM trip_sessions WHERE status = 'IN_TRANSIT'`
      ),
      query<{ count: string }>('SELECT COUNT(*)::int AS count FROM student_bus_allocations'),
      query<{ count: string }>(
        `SELECT COUNT(*)::int AS count FROM student_attendance_logs WHERE status = 'BOARDED'`
      ),
      this.getActiveAlerts(),
    ]);

    const fleet = buses.rows;
    return {
      totalFleetCount: fleet.length,
      activeTripsCount: Number(activeTrips.rows[0].count),
      idleBusesCount: fleet.filter((b) => b.status === 'IDLE').length,
      maintenanceCount: fleet.filter((b) => b.status === 'MAINTENANCE').length,
      totalStudentsEnrolled: Number(totalStudents.rows[0].count),
      totalStudentsBoardedToday: Number(boarded.rows[0].count),
      activeAlertsCount: alerts.length,
      recentAlerts: alerts.slice(0, 5),
    };
  }
}
