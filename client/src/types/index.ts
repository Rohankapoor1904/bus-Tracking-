export type UserRole = 'STUDENT' | 'DRIVER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  fullName: string;
  identifier: string;
  phone: string;
  campus: string;
  department?: string;
  assignedBusId?: string;
  assignedRouteId?: string;
  /** True when the session was opened with the shared global access login. */
  isGlobalAccess?: boolean;
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
  campus: string;
  colorHex: string;
  stops: RouteStop[];
  waypoints: [number, number][]; // [lon, lat]
}

export interface LiveBusState {
  busId: string;
  busNumber: string;
  registrationNumber: string;
  model: string;
  status: 'IDLE' | 'EN_ROUTE' | 'ARRIVED_CAMPUS' | 'MAINTENANCE';
  capacity: number;
  boardedCount: number;
  driverName: string;
  driverPhone: string;
  routeId?: string;
  routeName?: string;
  tripId?: string;
  // Null until the bus reports a GPS fix — never a fabricated position.
  latitude: number | null;
  longitude: number | null;
  speedKmh: number;
  bearing: number;
  altitudeM: number | null;
  accuracyM: number | null;
  lastPing: string | null;
  hasFix?: boolean;
  upcomingStopName: string;
  distanceToNextStopMeters: number;
  etaMinutesUpcomingStop: number;
}

export interface StudentAllocationResponse {
  allocation: {
    id: string;
    studentId: string;
    routeId: string;
    assignedStopId: string;
    busId?: string;
    academicSession: string;
    passNumber: string;
    seatNumber?: string;
    feeStatus: string;
  };
  route: Route;
  stop: RouteStop;
  bus: {
    id: string;
    busNumber: string;
    registrationNumber: string;
    capacity: number;
    assignedDriverName: string;
    assignedDriverPhone: string;
  };
  liveTracking: {
    isTripActive: boolean;
    tripId?: string;
    currentCoordinates: [number, number] | null; // [lon, lat] — null when no GPS fix
    hasFix?: boolean;
    speedKmh: number;
    bearing: number;
    distanceToStopMeters: number;
    etaMinutes: number;
    isWithinGeofence: boolean;
    lastPing?: string;
  };
}

export interface TripManifestResponse {
  trip: {
    id: string;
    busId: string;
    busNumber: string;
    routeId: string;
    routeName: string;
    status: string;
    direction: string;
    startedAt: string;
    totalPassengersBoarded: number;
  };
  route: Route;
  totalEnrolledStudents: number;
  totalBoarded: number;
  stopsManifest: {
    stopId: string;
    stopName: string;
    stopSequence: number;
    landmark: string;
    latitude: number;
    longitude: number;
    totalEnrolled: number;
    boardedCount: number;
    students: {
      studentId: string;
      studentName: string;
      rollNumber: string;
      department: string;
      phone: string;
      passNumber: string;
      status: 'PENDING' | 'BOARDED' | 'ABSENT';
      scannedAt?: string;
    }[];
  }[];
}

export interface FleetOverviewMetrics {
  totalFleetCount: number;
  activeTripsCount: number;
  idleBusesCount: number;
  maintenanceCount: number;
  totalStudentsEnrolled: number;
  totalStudentsBoardedToday: number;
  activeAlertsCount: number;
  recentAlerts: {
    id: string;
    busId: string;
    busNumber: string;
    alertType: string;
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    message: string;
    createdAt: string;
  }[];
}

export interface StudentRosterItem {
  id: string;
  fullName: string;
  rollNumber: string;
  department: string;
  phone: string;
  email: string;
  routeId: string;
  routeName?: string;
  stopId: string;
  stopName?: string;
  passNumber: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface DriverProfile {
  id: string;
  fullName: string;
  phone: string;
  licenseNumber: string;
  assignedBusId?: string;
  assignedBusNumber?: string;
  assignedRouteId?: string;
  assignedRouteName?: string;
  status: 'ACTIVE' | 'ON_DUTY' | 'ON_LEAVE' | 'INACTIVE';
  experienceYears?: number;
  emergencyContact?: string;
}
