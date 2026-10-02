-- ============================================================================
-- Maharishi Markandeshwar University (MMU Mullana / Sadopur)
-- Production PostgreSQL 15+ & PostGIS Geospatial Fleet Database Schema
-- Version: 1.0.0-PROD
-- ============================================================================

-- Enable PostGIS Spatial Extensions & UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ----------------------------------------------------------------------------
-- ENUMS & DOMAIN TYPES
-- ----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('STUDENT', 'DRIVER', 'ADMIN', 'DISPATCHER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE bus_status AS ENUM ('IDLE', 'EN_ROUTE', 'ARRIVED_CAMPUS', 'MAINTENANCE', 'OFFLINE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE trip_status AS ENUM ('SCHEDULED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED', 'DIVERTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE attendance_status AS ENUM ('PENDING', 'BOARDED', 'ABSENT', 'EXCUSED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE campus_location AS ENUM ('MULLANA_MAIN', 'SADOPUR_AMBALA', 'SOLAN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ----------------------------------------------------------------------------
-- 1. USERS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'STUDENT',
    full_name VARCHAR(150) NOT NULL,
    identifier VARCHAR(50) UNIQUE NOT NULL, -- Student Roll No / Driver Employee No / Admin ID
    phone VARCHAR(20) NOT NULL,
    avatar_url TEXT,
    campus campus_location NOT NULL DEFAULT 'MULLANA_MAIN',
    department VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_identifier ON users(identifier);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ----------------------------------------------------------------------------
-- 2. BUSES (FLEET ASSETS) TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS buses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bus_number VARCHAR(30) UNIQUE NOT NULL,      -- e.g. "BUS-01", "BUS-42"
    registration_number VARCHAR(30) UNIQUE NOT NULL, -- e.g. "HR-54-A-1993"
    model VARCHAR(100) NOT NULL DEFAULT 'Tata Marcopolo Deluxe AC 40-Seater',
    capacity INT NOT NULL DEFAULT 42,
    status bus_status NOT NULL DEFAULT 'IDLE',
    assigned_driver_id UUID REFERENCES users(id) ON DELETE SET NULL,
    default_route_id UUID,
    primary_campus campus_location NOT NULL DEFAULT 'MULLANA_MAIN',
    fuel_level_percent NUMERIC(5,2) DEFAULT 100.0,
    odometer_km NUMERIC(10,2) DEFAULT 0.0,
    device_imei VARCHAR(50),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_buses_status ON buses(status);
CREATE INDEX IF NOT EXISTS idx_buses_driver ON buses(assigned_driver_id);

-- ----------------------------------------------------------------------------
-- 3. TRANSIT ROUTES TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS routes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    route_code VARCHAR(30) UNIQUE NOT NULL,       -- e.g. "ROUTE-AMB-01"
    name VARCHAR(150) NOT NULL,                  -- e.g. "Ambala Cantt - MMU Mullana Express"
    description TEXT,
    origin_name VARCHAR(100) NOT NULL,
    destination_name VARCHAR(100) NOT NULL,
    total_distance_km NUMERIC(6,2) NOT NULL DEFAULT 0.0,
    estimated_duration_minutes INT NOT NULL DEFAULT 45,
    campus campus_location NOT NULL DEFAULT 'MULLANA_MAIN',
    morning_departure_time TIME NOT NULL DEFAULT '07:15:00',
    evening_return_time TIME NOT NULL DEFAULT '16:45:00',
    route_polyline GEOMETRY(LineString, 4326),   -- Complete road line geometry
    color_hex VARCHAR(10) NOT NULL DEFAULT '#E21E26',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_routes_code ON routes(route_code);
CREATE INDEX IF NOT EXISTS idx_routes_polyline ON routes USING GIST (route_polyline);

-- Add foreign key constraint back to buses
ALTER TABLE buses DROP CONSTRAINT IF EXISTS fk_buses_default_route;
ALTER TABLE buses ADD CONSTRAINT fk_buses_default_route FOREIGN KEY (default_route_id) REFERENCES routes(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 4. ROUTE STOPS & GEOFENCES TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS route_stops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    landmark TEXT,
    stop_sequence INT NOT NULL,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    location GEOMETRY(Point, 4326) NOT NULL,
    geofence_radius_meters INT NOT NULL DEFAULT 1000, -- Trigger radius for alerts
    scheduled_arrival_offset_mins INT NOT NULL DEFAULT 0, -- Minutes after route departure
    is_major_hub BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_route_stop_sequence UNIQUE(route_id, stop_sequence)
);

CREATE INDEX IF NOT EXISTS idx_route_stops_route ON route_stops(route_id);
CREATE INDEX IF NOT EXISTS idx_route_stops_location ON route_stops USING GIST (location);

-- ----------------------------------------------------------------------------
-- 5. STUDENT BUS ALLOCATIONS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_bus_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    route_id UUID NOT NULL REFERENCES routes(id) ON DELETE RESTRICT,
    assigned_stop_id UUID NOT NULL REFERENCES route_stops(id) ON DELETE RESTRICT,
    bus_id UUID REFERENCES buses(id) ON DELETE SET NULL,
    academic_session VARCHAR(20) NOT NULL DEFAULT '2025-2026',
    pass_number VARCHAR(50) UNIQUE NOT NULL,
    seat_number VARCHAR(10),
    is_valid BOOLEAN NOT NULL DEFAULT true,
    fee_status VARCHAR(20) NOT NULL DEFAULT 'PAID',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_student_academic_session UNIQUE(student_id, academic_session)
);

CREATE INDEX IF NOT EXISTS idx_allocations_student ON student_bus_allocations(student_id);
CREATE INDEX IF NOT EXISTS idx_allocations_route ON student_bus_allocations(route_id);
CREATE INDEX IF NOT EXISTS idx_allocations_stop ON student_bus_allocations(assigned_stop_id);
CREATE INDEX IF NOT EXISTS idx_allocations_bus ON student_bus_allocations(bus_id);

-- ----------------------------------------------------------------------------
-- 6. TRIP SESSIONS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trip_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bus_id UUID NOT NULL REFERENCES buses(id) ON DELETE RESTRICT,
    route_id UUID NOT NULL REFERENCES routes(id) ON DELETE RESTRICT,
    driver_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status trip_status NOT NULL DEFAULT 'SCHEDULED',
    direction VARCHAR(15) NOT NULL DEFAULT 'CAMPUS_BOUND', -- 'CAMPUS_BOUND' or 'RETURN_BOUND'
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    start_odometer_km NUMERIC(10,2),
    end_odometer_km NUMERIC(10,2),
    total_passengers_boarded INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trips_bus_active ON trip_sessions(bus_id, status);
CREATE INDEX IF NOT EXISTS idx_trips_route ON trip_sessions(route_id);
CREATE INDEX IF NOT EXISTS idx_trips_driver ON trip_sessions(driver_id);

-- ----------------------------------------------------------------------------
-- 7. LIVE TELEMETRY LOGS TABLE (Timescale/Spatial Ingestion)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS live_telemetry (
    id BIGSERIAL,
    trip_id UUID NOT NULL REFERENCES trip_sessions(id) ON DELETE CASCADE,
    bus_id UUID NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    coordinates GEOMETRY(Point, 4326) NOT NULL,
    speed_kmh NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
    bearing NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
    altitude_m NUMERIC(6, 2) DEFAULT 0.0,
    accuracy_m NUMERIC(5, 2) DEFAULT 5.0,
    battery_percent NUMERIC(4, 1),
    network_signal_bars SMALLINT,
    recorded_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, recorded_at)
);

CREATE INDEX IF NOT EXISTS idx_telemetry_bus_time ON live_telemetry(bus_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_trip ON live_telemetry(trip_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_spatial ON live_telemetry USING GIST (coordinates);

-- ----------------------------------------------------------------------------
-- 8. STUDENT ATTENDANCE LOGS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_attendance_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID NOT NULL REFERENCES trip_sessions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stop_id UUID NOT NULL REFERENCES route_stops(id) ON DELETE RESTRICT,
    status attendance_status NOT NULL DEFAULT 'PENDING',
    scanned_at TIMESTAMPTZ,
    verified_by_driver_id UUID REFERENCES users(id),
    verification_method VARCHAR(30) DEFAULT 'MANUAL_CONSOLE', -- 'MANUAL_CONSOLE', 'NFC_RFID', 'QR_CODE'
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_trip_student_attendance UNIQUE(trip_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_trip ON student_attendance_logs(trip_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON student_attendance_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_stop ON student_attendance_logs(stop_id);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON student_attendance_logs(status);

-- ----------------------------------------------------------------------------
-- 9. AUDIT & SAFETY ALERTS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fleet_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID REFERENCES trip_sessions(id) ON DELETE CASCADE,
    bus_id UUID NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL, -- 'OVER_SPEEDING', 'ROUTE_DEVIATION', 'SOS_EMERGENCY', 'EXTENDED_STOP'
    severity VARCHAR(20) NOT NULL DEFAULT 'WARNING', -- 'INFO', 'WARNING', 'CRITICAL'
    message TEXT NOT NULL,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    is_resolved BOOLEAN NOT NULL DEFAULT false,
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fleet_alerts_bus ON fleet_alerts(bus_id);
CREATE INDEX IF NOT EXISTS idx_fleet_alerts_unresolved ON fleet_alerts(is_resolved) WHERE is_resolved = false;

-- ----------------------------------------------------------------------------
-- TRIGGERS: AUTOMATIC updated_at TIMESTAMP
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_timestamp_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();
CREATE TRIGGER trg_buses_updated BEFORE UPDATE ON buses FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();
CREATE TRIGGER trg_routes_updated BEFORE UPDATE ON routes FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();
CREATE TRIGGER trg_route_stops_updated BEFORE UPDATE ON route_stops FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();
CREATE TRIGGER trg_allocations_updated BEFORE UPDATE ON student_bus_allocations FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();
CREATE TRIGGER trg_trip_sessions_updated BEFORE UPDATE ON trip_sessions FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();
CREATE TRIGGER trg_attendance_updated BEFORE UPDATE ON student_attendance_logs FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

-- ----------------------------------------------------------------------------
-- TRIGGER: AUTO POPULATE PostGIS GEOMETRY POINT FROM LAT/LON
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_stop_geometry()
RETURNS TRIGGER AS $$
BEGIN
    NEW.location = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_route_stops_geom BEFORE INSERT OR UPDATE ON route_stops FOR EACH ROW EXECUTE FUNCTION update_stop_geometry();

CREATE OR REPLACE FUNCTION update_telemetry_geometry()
RETURNS TRIGGER AS $$
BEGIN
    NEW.coordinates = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_telemetry_geom BEFORE INSERT OR UPDATE ON live_telemetry FOR EACH ROW EXECUTE FUNCTION update_telemetry_geometry();
