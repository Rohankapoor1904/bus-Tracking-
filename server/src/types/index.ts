// ============================================================================
// MMU FleetRadar 3D — Central Type Definitions
// ============================================================================

export type UserRole = 'STUDENT' | 'DRIVER' | 'ADMIN' | 'DISPATCHER';

export type CampusLocation = 'MULLANA_MAIN' | 'SADOPUR_AMBALA' | 'SOLAN';

export type BusStatus = 'IDLE' | 'EN_ROUTE' | 'ARRIVED_CAMPUS' | 'MAINTENANCE' | 'OFFLINE';

export type TripStatus = 'SCHEDULED' | 'IN_TRANSIT' | 'COMPLETED' | 'CANCELLED' | 'DIVERTED';

export type AttendanceStatus = 'PENDING' | 'BOARDED' | 'ABSENT' | 'EXCUSED';

export interface User {
  id: string;
  email: string;
  passwordHash?: string;
  role: UserRole;
  fullName: string;
  identifier: string; // Roll No / Employee ID / Admin ID
  phone: string;
  avatarUrl?: string;
  campus: CampusLocation;
  department?: string;
  assignedBusId?: string;
  assignedRouteId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RouteStop {
  id: string;
  routeId: string;
  name: string;
  landmark: string;
  stopSequence: number;
  latitude: number;
  longitude: number;
  geofenceRadiusMeters: number;
  scheduledArrivalOffsetMins: number;
  isMajorHub: boolean;
  assignedStudentCount?: number;
}

export interface Route {
  id: string;
  routeCode: string;
  name: string;
  description: string;
  originName: string;
  destinationName: string;
  totalDistanceKm: number;
  estimatedDurationMinutes: number;
  campus: CampusLocation;
  morningDepartureTime: string;
  eveningReturnTime: string;
  colorHex: string;
  stops: RouteStop[];
  waypoints: [number, number][]; // [longitude, latitude] coordinates array for MapLibre LineString
  isActive: boolean;
}

export interface Bus {
  id: string;
  busNumber: string;
  registrationNumber: string;
  model: string;
  capacity: number;
  status: BusStatus;
  assignedDriverId?: string;
  assignedDriverName?: string;
  assignedDriverPhone?: string;
  defaultRouteId?: string;
  defaultRouteName?: string;
  primaryCampus: CampusLocation;
  fuelLevelPercent: number;
  odometerKm: number;
  isActive: boolean;
  lastTelemetry?: TelemetryPoint;
}

export interface StudentAllocation {
  id: string;
  studentId: string;
  studentName?: string;
  studentRoll?: string;
  department?: string;
  phone?: string;
  routeId: string;
  routeName?: string;
  assignedStopId: string;
  assignedStopName?: string;
  busId?: string;
  busNumber?: string;
  academicSession: string;
  passNumber: string;
  seatNumber?: string;
  isValid: boolean;
  feeStatus: string;
}

export interface TripSession {
  id: string;
  busId: string;
  busNumber: string;
  routeId: string;
  routeName: string;
  driverId: string;
  driverName: string;
  status: TripStatus;
  direction: 'CAMPUS_BOUND' | 'RETURN_BOUND';
  startedAt?: string;
  endedAt?: string;
  startOdometerKm?: number;
  endOdometerKm?: number;
  totalPassengersBoarded: number;
  currentStopSequence: number;
  nextStopName?: string;
  distanceToNextStopMeters?: number;
  etaMinutesToNextStop?: number;
}

export interface TelemetryPoint {
  tripId: string;
  busId: string;
  busNumber?: string;
  routeId?: string;
  latitude: number;
  longitude: number;
  speedKmh: number;
  bearing: number;
  altitudeM: number;
  accuracyM: number;
  batteryPercent?: number;
  recordedAt: string;
}

export interface AttendanceRecord {
  id: string;
  tripId: string;
  studentId: string;
  studentName: string;
  rollNumber: string;
  department: string;
  stopId: string;
  stopName: string;
  status: AttendanceStatus;
  scannedAt?: string;
  verificationMethod: 'MANUAL_CONSOLE' | 'NFC_RFID' | 'QR_CODE';
}

export interface FleetAlert {
  id: string;
  tripId?: string;
  busId: string;
  busNumber: string;
  alertType: 'OVER_SPEEDING' | 'ROUTE_DEVIATION' | 'SOS_EMERGENCY' | 'EXTENDED_STOP' | 'GEOFENCE_ARRIVED';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  latitude?: number;
  longitude?: number;
  isResolved: boolean;
  createdAt: string;
}

export interface CampusBuilding3D {
  id: string;
  name: string;
  blockCode: string;
  heightMeters: number;
  minHeightMeters: number;
  colorHex: string;
  campus: CampusLocation;
  coordinates: [number, number][][]; // Polygon ring [lng, lat]
}

// ----------------------------------------------------------------------------
// WebSocket Protocols
// ----------------------------------------------------------------------------
export type WSActionType =
  | 'AUTH'
  | 'SUBSCRIBE'
  | 'UNSUBSCRIBE'
  | 'TELEMETRY_PING'
  | 'ATTENDANCE_UPDATE'
  | 'EMERGENCY_SOS'
  | 'FLEET_CONFIG_UPDATE'
  | 'TRIP_EVENT';

export interface WSInboundMessage {
  action: WSActionType;
  channel?: string;
  payload?: any;
}

export type WSEventType =
  | 'CONNECTED'
  | 'AUTH_SUCCESS'
  | 'BUS_POSITION_UPDATE'
  | 'FLEET_BATCH_UPDATE'
  | 'GEOFENCE_APPROACHING_ALERT'
  | 'ATTENDANCE_CHANGED'
  | 'EMERGENCY_ALERT'
  | 'TRIP_STATE_CHANGED'
  | 'ERROR'
  | 'FLEET_CONFIG_UPDATE'
  | 'TRIP_EVENT'
  | 'TRIP_STARTED'
  | 'TRIP_ENDED';

export interface WSOutboundMessage {
  event: WSEventType;
  timestamp: string;
  data: any;
}
