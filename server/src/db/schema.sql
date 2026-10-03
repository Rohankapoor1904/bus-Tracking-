-- ============================================================================
-- MMU FleetRadar 3D — Production PostgreSQL 16 + PostGIS Schema
-- Single source of truth for the real persistence layer.
-- IDs are TEXT so they map 1:1 to the grounded MMU seed identifiers
-- (e.g. 'bus-01', 'route-amb-01', 'usr-driver-01').
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "postgis";

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('STUDENT', 'DRIVER', 'ADMIN', 'DISPATCHER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE bus_status AS ENUM ('IDLE', 'EN_ROUTE', 'ARRIVED_CAMPUS', 'MAINTENANCE', 'OFFLINE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE trip_status AS ENUM ('SCHEDULED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED', 'DIVERTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE attendance_status AS ENUM ('PENDING', 'BOARDED', 'ABSENT', 'EXCUSED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE campus_location AS ENUM ('MULLANA_MAIN', 'SADOPUR_AMBALA', 'SOLAN');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ----------------------------------------------------------------------------
-- 1. USERS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          user_role NOT NULL DEFAULT 'STUDENT',
    full_name     VARCHAR(150) NOT NULL,
    identifier    VARCHAR(50) UNIQUE NOT NULL,
    phone         VARCHAR(20) NOT NULL,
    avatar_url    TEXT,
    campus        campus_location NOT NULL DEFAULT 'MULLANA_MAIN',
    department    VARCHAR(120),
    assigned_bus_id   TEXT,
    assigned_route_id TEXT,
    is_active     BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_role       ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_identifier ON users(identifier);

-- ----------------------------------------------------------------------------
-- 2. ROUTES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS routes (
    id                          TEXT PRIMARY KEY,
    route_code                  VARCHAR(30) UNIQUE NOT NULL,
    name                        VARCHAR(150) NOT NULL,
    description                 TEXT,
    origin_name                 VARCHAR(120) NOT NULL,
    destination_name            VARCHAR(120) NOT NULL,
    total_distance_km           NUMERIC(6,2) NOT NULL DEFAULT 0,
    estimated_duration_minutes  INT NOT NULL DEFAULT 45,
    campus                      campus_location NOT NULL DEFAULT 'MULLANA_MAIN',
    morning_departure_time      TIME NOT NULL DEFAULT '07:15:00',
    evening_return_time         TIME NOT NULL DEFAULT '16:45:00',
    route_polyline              GEOMETRY(LineString, 4326),
    waypoints                   JSONB NOT NULL DEFAULT '[]'::jsonb,
    color_hex                   VARCHAR(10) NOT NULL DEFAULT '#E21E26',
    is_active                   BOOLEAN NOT NULL DEFAULT true,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_routes_polyline ON routes USING GIST (route_polyline);

-- ----------------------------------------------------------------------------
-- 3. BUSES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS buses (
    id                    TEXT PRIMARY KEY,
    bus_number            VARCHAR(30) UNIQUE NOT NULL,
    registration_number   VARCHAR(30) UNIQUE NOT NULL,
    model                 VARCHAR(120) NOT NULL DEFAULT 'Tata Marcopolo Deluxe AC',
    capacity              INT NOT NULL DEFAULT 42,
    status                bus_status NOT NULL DEFAULT 'IDLE',
    assigned_driver_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
    default_route_id      TEXT REFERENCES routes(id) ON DELETE SET NULL,
    primary_campus        campus_location NOT NULL DEFAULT 'MULLANA_MAIN',
    fuel_level_percent    NUMERIC(5,2) DEFAULT 100.0,
    odometer_km           NUMERIC(10,2) DEFAULT 0.0,
    device_imei           VARCHAR(50),
    is_active             BOOLEAN NOT NULL DEFAULT true,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_buses_status ON buses(status);
CREATE INDEX IF NOT EXISTS idx_buses_driver ON buses(assigned_driver_id);

-- ----------------------------------------------------------------------------
-- 4. ROUTE STOPS (with PostGIS point + GIST index)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS route_stops (
    id                          TEXT PRIMARY KEY,
    route_id                    TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    name                        VARCHAR(150) NOT NULL,
    landmark                    TEXT,
    stop_sequence               INT NOT NULL,
    latitude                    NUMERIC(10,7) NOT NULL,
    longitude                   NUMERIC(10,7) NOT NULL,
    location                    GEOMETRY(Point, 4326) NOT NULL,
    geofence_radius_meters      INT NOT NULL DEFAULT 1000,
    scheduled_arrival_offset_mins INT NOT NULL DEFAULT 0,
    is_major_hub                BOOLEAN NOT NULL DEFAULT false,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_route_stop_sequence UNIQUE(route_id, stop_sequence)
);
CREATE INDEX IF NOT EXISTS idx_route_stops_route    ON route_stops(route_id);
CREATE INDEX IF NOT EXISTS idx_route_stops_location ON route_stops USING GIST (location);

-- ----------------------------------------------------------------------------
-- 5. STUDENT BUS ALLOCATIONS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_bus_allocations (
    id                TEXT PRIMARY KEY,
    student_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    route_id          TEXT NOT NULL REFERENCES routes(id) ON DELETE RESTRICT,
    assigned_stop_id  TEXT NOT NULL REFERENCES route_stops(id) ON DELETE RESTRICT,
    bus_id            TEXT REFERENCES buses(id) ON DELETE SET NULL,
    academic_session  VARCHAR(20) NOT NULL DEFAULT '2025-2026',
    pass_number       VARCHAR(50) UNIQUE NOT NULL,
    seat_number       VARCHAR(10),
    is_valid          BOOLEAN NOT NULL DEFAULT true,
    fee_status        VARCHAR(20) NOT NULL DEFAULT 'PAID',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_student_academic_session UNIQUE(student_id, academic_session)
);
CREATE INDEX IF NOT EXISTS idx_allocations_student ON student_bus_allocations(student_id);
CREATE INDEX IF NOT EXISTS idx_allocations_route   ON student_bus_allocations(route_id);

-- ----------------------------------------------------------------------------
-- 6. TRIP SESSIONS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trip_sessions (
    id                       TEXT PRIMARY KEY,
    bus_id                   TEXT NOT NULL REFERENCES buses(id) ON DELETE RESTRICT,
    route_id                 TEXT NOT NULL REFERENCES routes(id) ON DELETE RESTRICT,
    driver_id                TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status                   trip_status NOT NULL DEFAULT 'SCHEDULED',
    direction                VARCHAR(15) NOT NULL DEFAULT 'CAMPUS_BOUND',
    started_at               TIMESTAMPTZ,
    ended_at                 TIMESTAMPTZ,
    start_odometer_km        NUMERIC(10,2),
    end_odometer_km          NUMERIC(10,2),
    total_passengers_boarded INT NOT NULL DEFAULT 0,
    current_stop_sequence    INT NOT NULL DEFAULT 1,
    next_stop_name           TEXT,
    distance_to_next_stop_meters INT,
    eta_minutes_to_next_stop NUMERIC(6,1),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_trips_bus_status ON trip_sessions(bus_id, status);
CREATE INDEX IF NOT EXISTS idx_trips_route      ON trip_sessions(route_id);

-- ----------------------------------------------------------------------------
-- 7. LIVE TELEMETRY (high-frequency spatial ingestion log)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS live_telemetry (
    id                 BIGSERIAL PRIMARY KEY,
    trip_id            TEXT REFERENCES trip_sessions(id) ON DELETE SET NULL,
    bus_id             TEXT NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
    latitude           NUMERIC(10,7) NOT NULL,
    longitude          NUMERIC(10,7) NOT NULL,
    coordinates        GEOMETRY(Point, 4326) NOT NULL,
    speed_kmh          NUMERIC(6,2) NOT NULL DEFAULT 0.0,
    bearing            NUMERIC(5,2) NOT NULL DEFAULT 0.0,
    altitude_m         NUMERIC(7,2) DEFAULT 0.0,
    accuracy_m         NUMERIC(6,2) DEFAULT 5.0,
    battery_percent    NUMERIC(4,1),
    network_signal_bars SMALLINT,
    recorded_at        TIMESTAMPTZ NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_telemetry_bus_time ON live_telemetry(bus_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_spatial  ON live_telemetry USING GIST (coordinates);

-- ----------------------------------------------------------------------------
-- 8. STUDENT ATTENDANCE LOGS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_attendance_logs (
    id                   TEXT PRIMARY KEY,
    trip_id              TEXT NOT NULL REFERENCES trip_sessions(id) ON DELETE CASCADE,
    student_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stop_id              TEXT NOT NULL REFERENCES route_stops(id) ON DELETE RESTRICT,
    status               attendance_status NOT NULL DEFAULT 'PENDING',
    scanned_at           TIMESTAMPTZ,
    verified_by_driver_id TEXT REFERENCES users(id),
    verification_method  VARCHAR(30) DEFAULT 'MANUAL_CONSOLE',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_trip_student_attendance UNIQUE(trip_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_attendance_trip ON student_attendance_logs(trip_id);

-- ----------------------------------------------------------------------------
-- 9. FLEET ALERTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fleet_alerts (
    id           TEXT PRIMARY KEY,
    trip_id      TEXT REFERENCES trip_sessions(id) ON DELETE CASCADE,
    bus_id       TEXT NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
    alert_type   VARCHAR(50) NOT NULL,
    severity     VARCHAR(20) NOT NULL DEFAULT 'WARNING',
    message      TEXT NOT NULL,
    latitude     NUMERIC(10,7),
    longitude    NUMERIC(10,7),
    is_resolved  BOOLEAN NOT NULL DEFAULT false,
    resolved_by  TEXT REFERENCES users(id),
    resolved_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fleet_alerts_unresolved
    ON fleet_alerts(is_resolved) WHERE is_resolved = false;

-- ----------------------------------------------------------------------------
-- TRIGGERS: updated_at maintenance
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_timestamp_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['users','routes','buses','route_stops',
                             'student_bus_allocations','trip_sessions','student_attendance_logs']
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated ON %1$s;', t);
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON %1$s
             FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();', t);
    END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- TRIGGERS: auto-populate PostGIS geometry from lat/lon
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_stop_geometry()
RETURNS TRIGGER AS $$
BEGIN
    NEW.location = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_route_stops_geom ON route_stops;
CREATE TRIGGER trg_route_stops_geom
    BEFORE INSERT OR UPDATE ON route_stops
    FOR EACH ROW EXECUTE FUNCTION update_stop_geometry();

CREATE OR REPLACE FUNCTION update_telemetry_geometry()
RETURNS TRIGGER AS $$
BEGIN
    NEW.coordinates = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_telemetry_geom ON live_telemetry;
CREATE TRIGGER trg_telemetry_geom
    BEFORE INSERT OR UPDATE ON live_telemetry
    FOR EACH ROW EXECUTE FUNCTION update_telemetry_geometry();
