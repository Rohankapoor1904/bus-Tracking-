# MMU FleetRadar 3D — Maharishi Markandeshwar University Real-Time Bus Tracking System

[![System Status](https://img.shields.io/badge/System-Production%20Ready-emerald.svg)]()
[![PostGIS Spatial](https://img.shields.io/badge/Geospatial-PostGIS%20%2F%20SRID%204326-blue.svg)]()
[![Telemetry Stream](https://img.shields.io/badge/Ingestion-1--2%20Hz%20WebSocket-red.svg)]()
[![3D Viewport](https://img.shields.io/badge/3D%20Engine-MapLibre%20GL%20JS-purple.svg)]()

Production-grade real-time 3D geospatial bus tracking, high-frequency telemetry streaming, and automated student manifest management system built specifically for **Maharishi Markandeshwar University (MMU Mullana & Sadopur campuses)**.

---

## 🏫 Institutional Identity & Grounded Data

- **Institutions:** Maharishi Markandeshwar (Deemed to be University) Mullana & MMU Sadopur Campus
- **Campus Coordinates:**
  - MMU Mullana Main Campus: `30.250450° N, 77.045050° E`
  - MMU Sadopur Ambala Campus: `30.342900° N, 76.814200° E`
- **Branding Tokens:**
  - Primary Brand Crimson: `#E21E26`
  - Academic Deep Navy: `#0D1B3E`
  - Heraldic Amber Gold: `#F59E0B` / `#FBBF24`
- **Official Helpline:** +91-1731-274475 (Fleet Dispatch) | Toll-Free: 1800 2740 240
- **Regional Corridors Grounded:**
  1. `ROUTE-AMB-01`: Ambala Cantt Railway Station ➔ MMU Mullana Campus Terminal
  2. `ROUTE-YNR-02`: Yamunanagar Workshop Chowk ➔ Jagadhri ➔ MMU Mullana Hospital Bay
  3. `ROUTE-KKR-03`: Kurukshetra New Bus Stand ➔ Pipli ➔ Shahbad ➔ MMU Mullana Gate
  4. `ROUTE-CHD-04`: Chandigarh Tribune Chowk ➔ Sadopur Campus ➔ MMU Mullana

---

## 🚀 Quick Start Guide

### 1. Start PostgreSQL (PostGIS) & Redis
```bash
# From repo root — starts PostGIS + Redis with persistent volumes:
docker compose up -d
```

### 2. Configure the Backend Environment
```bash
cp server/.env.example server/.env
# then edit server/.env — set DATABASE_URL, REDIS_URL and a strong JWT_SECRET
```
Generate a production secret with:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Install Dependencies
```bash
# From workspace root:
npm run install:all
```

### 4. Start Backend & Frontend Simultaneously
```bash
# Starts both Backend (Port 4000) and 3D Frontend (Port 5173):
npm run dev
```
On first boot the server applies the PostGIS schema (`server/src/db/schema.sql`)
and seeds the grounded MMU reference data (routes, stops, fleet, demo personas).

### 5. Open in Browser
- **Frontend App:** [http://localhost:5173/](http://localhost:5173/)
- **Backend API:** [http://localhost:4000/api/v1](http://localhost:4000/api/v1)
- **Health Check:** [http://localhost:4000/health](http://localhost:4000/health)
- **WebSocket Gateway:** `ws://localhost:4000/ws`

### 6. Run Automated Test Suite
```bash
npm run test
```

---

## 🔐 Production Hardening

- **Authentication is enforced on every mutating path.** REST endpoints use JWT + RBAC, and the WebSocket gateway rejects `TELEMETRY_PING`, `EMERGENCY_SOS` and `ATTENDANCE_UPDATE` from unauthenticated or unauthorized clients.
- **Telemetry is authenticated, role-scoped and validated.** Drivers may only broadcast for their assigned vehicle; coordinates are bounded to the MMU corridor and speed is capped before alerts/broadcasts.
- **Secrets are environment-driven.** `JWT_SECRET` has no hardcoded fallback in production, and `CORS_ORIGIN` must be an explicit allowlist.
- **Demo personas are disabled by default in production** (`ENABLE_DEMO_ACCOUNTS=false`), so the shared demo password and `/auth/demo-accounts` endpoint are not exposed.
- **Transport protections:** `helmet`, request size limits, and login rate limiting.
- **Data persistence:** all fleet state lives in PostgreSQL + PostGIS, so it survives restarts and supports horizontal scaling; Redis (optional) provides a latest-position cache and cross-instance WebSocket fan-out.


---

## 🔑 Demo Personas & Instant Switcher

The application includes an instant **1-Click Persona Switcher** in the navigation bar:

| Role | Name | Email | Password | Assigned Vehicle / Stop |
| :--- | :--- | :--- | :--- | :--- |
| **Student** | Aarav Gupta | `student.aarav@mmumullana.org` | `MMU@Secure2026` | BUS-01 • Ambala Cantt Stop |
| **Student** | Sneha Sharma | `student.sneha@mmumullana.org` | `MMU@Secure2026` | BUS-01 • Mahesh Nagar Stop |
| **Driver** | Rajesh Kumar Sharma | `driver.rajesh@mmumullana.org` | `MMU@Secure2026` | BUS-01 (HR-54-A-1993) |
| **Driver** | Gurpreet Singh Saini | `driver.gurpreet@mmumullana.org` | `MMU@Secure2026` | BUS-02 (HR-54-A-2004) |
| **Admin** | Dr. Sandeep Sharma | `admin@mmumullana.org` | `MMU@Secure2026` | Dean Fleet Logistics |

---

## 🎯 Architecture & System Capabilities

### 1. Student 3D Experience
- **Photorealistic 3D Buildings:** Real MMU campus blocks rendered with volumetric extrusions (`fill-extrusion`) based on actual building heights (Teaching Hospital 28m, Cardiac Pavilion 24m, Engineering Complex 20m, Hostels 22m, Admin Block 18m).
- **Dynamic 55° Pitch & Heading Follow:** Tilts along the vehicle's direction of travel for an authentic 3D driving perspective.
- **60 FPS Lerp & Slerp Interpolation:** GPS packets arriving at 1-2 Hz are smoothed using a client-side linear and spherical shortest-arc engine for stutter-free vehicle movement.
- **1 km Geofence Push Alert:** Triggers visual notification banner and harmonic Web Audio API chime when the bus enters the 1000m perimeter of the student's stop.

### 2. Driver Transit Terminal
- **High-Contrast Cockpit:** Optimized for high-sunlight or night driving readability.
- **Continuous 1-2 Hz GPS Broadcaster:** HTML5 Geolocation watch with speed and heading calculations.
- **Screen Wake-Lock API:** Keeps the mobile device display active without timing out.
- **Offline Telemetry Queue:** Spools points locally when crossing cellular dead zones and automatically flushes on reconnect.
- **Stop-Wise Manifest Console:** Displays scheduled stops with assigned student rosters; one-tap check-in toggles (`Boarded` / `Absent`).
- **Emergency SOS Beacon:** Critical alarm broadcast directly to the Admin Fleet Radar.

### 3. Central Logistics Admin Fleet Radar
- **3D Multi-Bus Canvas:** Tracks all active vehicles simultaneously with live speeds and heading vectors.
- **Stop-Wise Manifest & Capacity Analytics:** Aggregated boarding progress bars per transit corridor.
- **Real-Time Safety Alarms:** Automatic detection of over-speeding (> 75 km/h) and driver SOS calls with one-click resolution.
- **Autonomous Simulation Engine:** Built-in continuous telemetry simulator allowing immediate out-of-the-box demonstration without physical hardware.

---

## 📁 Repository Structure

```
├── assets/
│   └── branding/              # Official MMU raster and vector logo assets
│       ├── mmu_logo.png       # Archive.org official crest PNG
│       └── mmu_logo.svg       # Resolution-independent SVG logo
├── docs/                      # Production specifications & data architectures
│   ├── RESEARCH.md            # Grounded MMU institutional & geospatial research
│   ├── ARCHITECTURE.md        # Telemetry ingestion & geospatial pipelines
│   ├── DATABASE_SCHEMA.sql    # PostgreSQL 15 + PostGIS DDL schema
│   ├── API_CONTRACT.md        # REST & WebSocket telemetry payloads
│   ├── MAPBOX_3D_INTEGRATION.md # 3D vector extrusions & 60fps lerp guide
│   └── TASKS.md               # Master checklist of completed build items
├── server/                    # Node.js + TypeScript Fastify/Express + WS Backend
│   ├── src/
│   │   ├── config/            # Environment settings
│   │   ├── db/                # PostGIS spatial engine, database manager & seeds
│   │   ├── middleware/        # JWT & RBAC authorization
│   │   ├── routes/            # REST endpoint routers (Auth, Fleet, Trips, etc.)
│   │   ├── services/          # Telemetry ingestion, auth & spatial evaluator
│   │   ├── types/             # Central TypeScript definitions
│   │   └── websocket/         # 1-2 Hz WebSocket Telemetry Gateway
│   └── test/                  # Automated integration verification test suite
└── client/                    # Vite + React + MapLibre GL 3D Frontend
    ├── public/branding/       # Copied institutional assets
    └── src/
        ├── components/
        │   ├── 3d/            # MapLibre 3D Viewport & 60fps Lerp Engine
        │   ├── admin/         # Fleet Radar 3D Command Center
        │   ├── common/        # Header & Persona Switcher
        │   ├── driver/        # High-contrast cockpit & manifest console
        │   └── student/       # 3D tracking cockpit & digital bus pass
        └── services/          # Typed API, WebSocket & Web Audio alert clients
```
