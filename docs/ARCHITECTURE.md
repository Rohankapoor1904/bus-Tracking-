# MMU Real-Time 3D Geospatial Bus Tracking System — System Architecture Specification

**System Name:** Maharishi Markandeshwar University FleetRadar 3D  
**Document Version:** 1.0.0-PROD  
**Architect:** Principal Full-Stack Geospatial Systems Architect  
**Classification:** Core System Architecture Document  

---

## 1. High-Level System Overview & Topological Blueprint

The MMU Real-Time 3D Bus Tracking System is an event-driven, micro-service-ready geospatial platform engineered for high-frequency telemetry ingestion (1-2 Hz per vehicle), sub-second propagation to thousands of active client viewports, spatial geofencing with PostGIS & Redis GEO, and GPU-accelerated 3D vector map rendering.

```
                      +---------------------------------------+
                      |   Driver Active Telemetry Unit        |
                      |   - HTML5 Geolocation Watch / GPS     |
                      |   - Offline SQLite Buffer / Dexie.js   |
                      |   - WebSocket Client (1-2 Hz)         |
                      +-------------------+-------------------+
                                          |
                         WSS / JSON Telemetry Payload
                                          v
                      +---------------------------------------+
                      |   API Gateway & Real-Time Server      |
                      |   (Node.js Fastify / Express + WS)    |
                      |   - JWT Token Authentication          |
                      |   - Telemetry Ingestion Pipeline      |
                      |   - Spatial Validator (Speed/Noise)   |
                      +---------+-------------------+---------+
                                |                   |
             Publish Stream     |                   | Read / Write Entity
                                v                   v
     +-------------------------------+   +------------------------------------+
     | Redis Caching & In-Memory GEO |   | PostgreSQL 15 + PostGIS Extension  |
     | - GEOADD (bus_positions)      |   | - Spatial Tables & GiST Indexes    |
     | - GEORADIUS (1km Geofence)    |   | - ST_DWithin, ST_Distance Queries  |
     | - Pub/Sub Channel (bus_stream)|   | - Historical Telemetry Audit Trail |
     +---------------+---------------+   | - Relational Student Allocations   |
                     |                   +------------------------------------+
       WebSocket Broadcast
                     v
   +---------------------------------------+----------------------------------+
   |                                       |                                  |
   v                                       v                                  v
+------------------------+  +-------------------------------+  +-------------------------------+
| Student 3D Mobile/Web  |  | Driver Transit Console        |  | Central Logistics Fleet Radar |
| - MapLibre GL 3D Engine|  | - Live Stoppage Roster        |  | - Multi-Bus 3D Birds-Eye View |
| - Dynamic Pitch (45-60)|  | - Manifest Check-In (Boarding)|  | - Route Deviation Detection   |
| - 60fps Spherical Lerp |  | - WakeLock & Background Keep  |  | - Capacity & Overcrowd Alert  |
| - 1km Proximity Alert  |  | - Emergency SOS Beacon        |  | - Real-Time Attendance Metrics|
+------------------------+  +-------------------------------+  +-------------------------------+
```

---

## 2. Ingestion & Telemetry Processing Pipeline

### 2.1 Driver Telemetry Ingestion Flow
1. **Acquisition:** The driver terminal captures `GeolocationPosition` via high-accuracy GPS hardware polling at 1000ms intervals.
2. **Local Dead-Reckoning & Validation:**
   - Drops readings where `accuracy > 30` meters (multipath mitigation).
   - Computes instant derivative speed if device reporting is null: `v = d(lat, lon) / dt`.
   - Filters velocity spikes (> 110 km/h is flagged as GPS glitch on rural highway).
3. **Transmission:** Emits binary or compact JSON packets over persistent TLS WebSockets (`/ws/telemetry/driver`).
4. **Offline Resilience & Spooling:**
   - If WebSocket connection drops, payloads are appended to an indexed IndexedDB / SQLite transaction buffer with ISO-8601 monotonic timestamps.
   - Upon reconnect, the driver terminal executes bulk backpressure flush with batch pacing (max 50 points/second) to avoid server ingress saturation.

### 2.2 Server-Side Telemetry Processing Pipeline
```
[WS Frame Inbound]
       │
       ▼
[Token & Session Verification] ──(Invalid)──> [Terminate Frame & Disconnect]
       │ (Valid)
       ▼
[Kalman Velocity & Coordinate Smoothing]
       │
       ▼
[Parallel Write Fork]
  ├──> [Redis GEOADD fleet:coordinates <lon> <lat> <bus_id>]
  ├──> [Redis HSET fleet:live:<bus_id> speed, heading, trip_id, timestamp]
  ├──> [Redis Pub/Sub PUBLISH fleet:telemetry:stream payload]
  └──> [Async Batch Buffer -> PostgreSQL live_telemetry (Timescale/Spatial)]
       │
       ▼
[Geofence Proximity Evaluator]
  ├── Query Redis GEORADIUS or PostGIS ST_DWithin against student stops on active route
  └── If Distance <= 1000m AND not previously notified: Trigger Event bus:near_stop
```

---

## 3. Real-Time Spatial Indexing & Caching Layer

### 3.1 Redis Geospatial Structures
- **Live Key:** `fleet:geo:active`
  - Command: `GEOADD fleet:geo:active <longitude> <latitude> <bus_id>`
  - Purpose: Ultra-low latency spatial radius searches (`GEORADIUSBYMEMBER` or `GEOSEARCH`).
- **Telemetry Hash:** `fleet:bus:<bus_id>:telemetry`
  - Fields: `speed`, `bearing`, `altitude`, `accuracy`, `route_id`, `driver_id`, `updated_at`, `status`.
- **Pub/Sub Channels:**
  - `channel:fleet:broadcast`: Emits global bus coordinate deltas every 1000ms.
  - `channel:route:<route_id>`: Emits route-scoped telemetry for subscribed student clients.
  - `channel:bus:<bus_id>:alerts`: Over-speeding, breakdown, or route deviation notifications.

### 3.2 PostGIS Spatial Indexing Engine
- Spatial Reference System Identifier: **SRID 4326** (WGS 84 standard GPS).
- Projective calculations (meters/distances): Cast to `geography` type or use `ST_Transform(geom, 3857)`.
- Indexes: `CREATE INDEX idx_route_stops_geom ON route_stops USING GIST (location);`
- Efficient Radius Search:
  ```sql
  SELECT s.id, s.name, s.stop_sequence,
         ST_Distance(s.location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance_meters
  FROM route_stops s
  WHERE s.route_id = $3
    AND ST_DWithin(s.location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 1000)
  ORDER BY distance_meters ASC;
  ```

---

## 4. Client-Side 3D Geospatial Engine & Render Loop

### 4.1 MapLibre GL / Mapbox 3D Vector Building Extrusions
The client rendering engine visualizes MMU Mullana & Sadopur campuses with 3D buildings:
- **Layer Type:** `fill-extrusion`
- **Extrusion Height:** Driven by dynamic building metadata `['get', 'height']` or fallbacks based on campus block classifications (Hospital 24m, Engineering Block 18m, Hostels 20m, Admin Block 15m).
- **Extrusion Base:** Driven by `['get', 'min_height']` or `0`.
- **Ambient & Sunlight Shadows:** Configured with directional sun lighting oriented to realistic time-of-day solar vectors for Ambala coordinates (`30.25° N, 77.05° E`).

### 4.2 Smooth 60 FPS Coordinate Lerp & Heading Slerp
GPS telemetry arrives discretely at 1 Hz intervals. Direct marker positioning causes jarring leaps. The client viewport implements a continuous requestAnimationFrame (rAF) linear interpolation engine:
```typescript
interface InterpolationState {
  startPos: [number, number];
  targetPos: [number, number];
  startBearing: number;
  targetBearing: number;
  startTime: number;
  duration: number; // e.g. 1000ms
}

function updateBusPosition(now: number, state: InterpolationState): { currentPos: [number, number], currentBearing: number } {
  const elapsed = now - state.startTime;
  const t = Math.min(1.0, elapsed / state.duration);
  // Cubic ease-out or linear smoothing
  const lat = state.startPos[0] + (state.targetPos[0] - state.startPos[0]) * t;
  const lng = state.startPos[1] + (state.targetPos[1] - state.startPos[1]) * t;
  
  // Spherical shortest-arc angle interpolation for heading
  let diff = (state.targetBearing - state.startBearing + 180) % 360 - 180;
  if (diff < -180) diff += 360;
  const bearing = state.startBearing + diff * t;
  
  return { currentPos: [lat, lng], currentBearing: (bearing + 360) % 360 };
}
```

### 4.3 Dynamic 3D Camera Follow Mechanics
- Camera follows the active bus along its tangent vector:
  - **Pitch:** 45° to 60° (cinematic forward perspective).
  - **Bearing:** Synchronized with bus motion bearing or locked to smooth orbital drag.
  - **Zoom Level:** Dynamic speed-based zooming:
    - Speed < 15 km/h: Zoom 17.5 (high campus detail, building extrusions prominent).
    - Speed 15 - 50 km/h: Zoom 16.0 (suburban arterial view).
    - Speed > 50 km/h: Zoom 14.5 (highway corridor overview).

---

## 5. Security & Authentication Architecture

1. **Role-Based Access Control (RBAC):**
   - `STUDENT`: Read-only access to allocated route, assigned bus telemetry, campus POIs, and personal attendance history.
   - `DRIVER`: Write access to stream active trip telemetry, update boarding manifest for assigned route, trigger breakdown/emergency beacon.
   - `ADMIN`: Full CRUD over buses, routes, stops, driver credentials, live fleet overview, system audit logs, and geofence alarms.
2. **Token Lifecycle:** Stateless JWT (HMAC-SHA256) with short expiration (24h) and secure HTTP-only cookie or Bearer header transmission.
3. **Telemetry Ingestion Guards:** Rate-limiting per driver socket (max 3 packets/sec) to defend against DDoS or malfunctioning GPS sensors.
