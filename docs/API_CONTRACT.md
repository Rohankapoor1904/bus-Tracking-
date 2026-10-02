# MMU FleetRadar 3D — Complete API & Real-Time Telemetry Contract

**Document Version:** 1.0.0-PROD  
**Base Protocol:** HTTPS (REST) & WSS (Persistent Real-Time Streaming)  
**Base REST URL:** `http://localhost:4000/api/v1`  
**WebSocket URL:** `ws://localhost:4000/ws`  

---

## 1. Authentication & Session Security

All protected routes require an HTTP header:
`Authorization: Bearer <JWT_ACCESS_TOKEN>`

### 1.1 POST `/api/v1/auth/login`
Authenticates Student, Driver, or Admin.

**Request Payload:**
```json
{
  "email": "driver.rajesh@mmumullana.org",
  "password": "SecurePassword123!",
  "role": "DRIVER"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 86400,
    "user": {
      "id": "e4a2c070-5b43-41bb-bfa0-58be7e108871",
      "email": "driver.rajesh@mmumullana.org",
      "role": "DRIVER",
      "fullName": "Rajesh Kumar Sharma",
      "identifier": "DRV-104",
      "phone": "+91-9876543210",
      "campus": "MULLANA_MAIN",
      "assignedBusId": "7d9b4b0e-f782-4f33-872e-07a829e1f98a",
      "assignedRouteId": "8f12c930-b981-420a-939e-29f8c12a7810"
    }
  }
}
```

---

## 2. Fleet & Geospatial Master Data APIs

### 2.1 GET `/api/v1/routes`
Retrieves all transit corridors with waypoints, distances, and stop counts.

**Query Parameters:**
- `campus` (optional): `MULLANA_MAIN` | `SADOPUR_AMBALA`

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "8f12c930-b981-420a-939e-29f8c12a7810",
      "routeCode": "ROUTE-AMB-01",
      "name": "Ambala Cantt - MMU Mullana Express",
      "origin": "Ambala Cantt Railway Station",
      "destination": "MMEC Engineering Block, MMU Mullana",
      "totalDistanceKm": 29.4,
      "estimatedDurationMinutes": 48,
      "campus": "MULLANA_MAIN",
      "morningDepartureTime": "07:15:00",
      "eveningReturnTime": "16:45:00",
      "colorHex": "#E21E26",
      "stopsCount": 8,
      "stops": [
        {
          "id": "11111111-1111-1111-1111-111111111101",
          "name": "Ambala Cantt Railway Station Bus Bay",
          "stopSequence": 1,
          "latitude": 30.33268,
          "longitude": 76.83756,
          "geofenceRadiusMeters": 1000,
          "scheduledOffsetMins": 0,
          "isMajorHub": true
        },
        {
          "id": "11111111-1111-1111-1111-111111111105",
          "name": "Saha Industrial Junction",
          "stopSequence": 5,
          "latitude": 30.2641,
          "longitude": 76.9942,
          "geofenceRadiusMeters": 1000,
          "scheduledOffsetMins": 32,
          "isMajorHub": true
        },
        {
          "id": "11111111-1111-1111-1111-111111111108",
          "name": "MMEC Bus Terminal (Campus)",
          "stopSequence": 8,
          "latitude": 30.24853,
          "longitude": 77.04402,
          "geofenceRadiusMeters": 500,
          "scheduledOffsetMins": 48,
          "isMajorHub": true
        }
      ],
      "polylineGeoJson": {
        "type": "LineString",
        "coordinates": [
          [76.83756, 30.33268],
          [76.85243, 30.32981],
          [76.88371, 30.31849],
          [76.99420, 30.26410],
          [77.01830, 30.25890],
          [77.04352, 30.25201],
          [77.04402, 30.24853]
        ]
      }
    }
  ]
}
```

### 2.2 GET `/api/v1/buses/live`
Fetches real-time status of all active fleet vehicles.

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "busId": "7d9b4b0e-f782-4f33-872e-07a829e1f98a",
      "busNumber": "BUS-01",
      "registrationNumber": "HR-54-A-1993",
      "status": "EN_ROUTE",
      "routeId": "8f12c930-b981-420a-939e-29f8c12a7810",
      "routeName": "Ambala Cantt - MMU Mullana Express",
      "driverName": "Rajesh Kumar Sharma",
      "driverPhone": "+91-9876543210",
      "currentLatitude": 30.2641,
      "currentLongitude": 76.9942,
      "speedKmh": 42.5,
      "bearing": 112.4,
      "altitudeM": 268.0,
      "accuracyM": 4.2,
      "lastPingTimestamp": "2026-10-02T22:30:00.124Z",
      "currentCapacity": 42,
      "boardedCount": 31,
      "upcomingStopName": "Kalpi Bus Shelter",
      "etaMinutesUpcomingStop": 6.5
    }
  ]
}
```

---

## 3. Driver Console Lifecycle & Manifest APIs

### 3.1 POST `/api/v1/trips/start`
Triggered by driver when embarking on morning or evening route run.

**Request Payload:**
```json
{
  "busId": "7d9b4b0e-f782-4f33-872e-07a829e1f98a",
  "routeId": "8f12c930-b981-420a-939e-29f8c12a7810",
  "direction": "CAMPUS_BOUND",
  "startOdometerKm": 48210.5
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "tripId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "status": "IN_TRANSIT",
    "startedAt": "2026-10-02T07:15:00.000Z",
    "totalAssignedStudents": 38,
    "stops": [
      {
        "stopId": "11111111-1111-1111-1111-111111111101",
        "name": "Ambala Cantt Railway Station Bus Bay",
        "studentCount": 14,
        "students": [
          {
            "studentId": "33333333-3333-3333-3333-333333333301",
            "fullName": "Aarav Gupta",
            "rollNumber": "11221001",
            "department": "B.Tech CSE - 3rd Year",
            "phone": "+91-9123456789",
            "status": "PENDING"
          }
        ]
      }
    ]
  }
}
```

### 3.2 POST `/api/v1/attendance/check-in`
Driver toggles student status at the active stoppage.

**Request Payload:**
```json
{
  "tripId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "studentId": "33333333-3333-3333-3333-333333333301",
  "stopId": "11111111-1111-1111-1111-111111111101",
  "status": "BOARDED",
  "verificationMethod": "MANUAL_CONSOLE"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "studentId": "33333333-3333-3333-3333-333333333301",
    "status": "BOARDED",
    "scannedAt": "2026-10-02T07:18:22.450Z",
    "busBoardedCount": 1
  }
}
```

---

## 4. Student Real-Time Viewport APIs

### 4.1 GET `/api/v1/student/allocation`
Returns authenticated student's route, assigned stop, bus, driver, and live tracking status.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "student": {
      "id": "33333333-3333-3333-3333-333333333301",
      "fullName": "Aarav Gupta",
      "rollNumber": "11221001",
      "passNumber": "MMU-PASS-2026-0891"
    },
    "assignedRoute": {
      "id": "8f12c930-b981-420a-939e-29f8c12a7810",
      "name": "Ambala Cantt - MMU Mullana Express",
      "routeCode": "ROUTE-AMB-01"
    },
    "assignedStop": {
      "id": "11111111-1111-1111-1111-111111111101",
      "name": "Ambala Cantt Railway Station Bus Bay",
      "latitude": 30.33268,
      "longitude": 76.83756,
      "stopSequence": 1
    },
    "assignedBus": {
      "id": "7d9b4b0e-f782-4f33-872e-07a829e1f98a",
      "busNumber": "BUS-01",
      "registrationNumber": "HR-54-A-1993",
      "driverName": "Rajesh Kumar Sharma",
      "driverPhone": "+91-9876543210"
    },
    "activeTrip": {
      "tripId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "isLive": true,
      "currentLocation": [76.85243, 30.32981],
      "distanceToStopMeters": 1420,
      "etaMinutes": 4.2,
      "isWithinGeofence": false
    }
  }
}
```

---

## 5. Admin Fleet Radar & Capacity Analytics APIs

### 5.1 GET `/api/v1/admin/fleet-overview`
Comprehensive dashboard metrics for the Logistics Department.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "totalFleetCount": 18,
    "activeTripsCount": 12,
    "idleBusesCount": 5,
    "maintenanceCount": 1,
    "totalStudentsEnrolled": 684,
    "totalStudentsBoardedToday": 542,
    "activeAlertsCount": 2,
    "recentAlerts": [
      {
        "id": "99999999-9999-9999-9999-999999999901",
        "busNumber": "BUS-04",
        "alertType": "OVER_SPEEDING",
        "severity": "WARNING",
        "message": "Vehicle exceeded 75 km/h near Saha Bypass (reported 82 km/h)",
        "timestamp": "2026-10-02T22:15:30.000Z"
      }
    ]
  }
}
```

---

## 6. Real-Time WebSocket Telemetry Protocol

### 6.1 Endpoint: `/ws`
Clients connect using:
`ws://localhost:4000/ws?token=<JWT_TOKEN>&role=<STUDENT|DRIVER|ADMIN>`

#### Inbound Frame: Client Authentication & Subscription
```json
{
  "action": "SUBSCRIBE",
  "channel": "ROUTE_TRACKING",
  "payload": {
    "routeId": "8f12c930-b981-420a-939e-29f8c12a7810",
    "busId": "7d9b4b0e-f782-4f33-872e-07a829e1f98a"
  }
}
```

#### Inbound Frame: Driver Telemetry Stream (1-2 Hz Upstream)
```json
{
  "action": "TELEMETRY_PING",
  "payload": {
    "tripId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "busId": "7d9b4b0e-f782-4f33-872e-07a829e1f98a",
    "latitude": 30.264100,
    "longitude": 76.994200,
    "speed": 44.5,
    "bearing": 114.2,
    "altitude": 268.4,
    "accuracy": 3.8,
    "batteryLevel": 88.0,
    "timestamp": 1790962800124
  }
}
```

#### Outbound Frame: Real-Time Position Broadcast (Downstream to Students & Admin)
```json
{
  "event": "BUS_POSITION_UPDATE",
  "data": {
    "busId": "7d9b4b0e-f782-4f33-872e-07a829e1f98a",
    "busNumber": "BUS-01",
    "routeId": "8f12c930-b981-420a-939e-29f8c12a7810",
    "latitude": 30.264100,
    "longitude": 76.994200,
    "speed": 44.5,
    "bearing": 114.2,
    "altitude": 268.4,
    "timestamp": 1790962800124,
    "etaMinutesAssignedStop": 5.4,
    "distanceMetersAssignedStop": 2100
  }
}
```

#### Outbound Frame: Proximity Geofence Trigger (< 1000m)
```json
{
  "event": "GEOFENCE_APPROACHING_ALERT",
  "data": {
    "busNumber": "BUS-01",
    "stopName": "Ambala Cantt Railway Station Bus Bay",
    "distanceMeters": 850,
    "etaMinutes": 2.1,
    "message": "Bus BUS-01 is within 1 km of your pickup stop!"
  }
}
```
