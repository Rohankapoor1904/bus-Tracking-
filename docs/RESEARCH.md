# Maharishi Markandeshwar University (MMU) — Geospatial & Institutional Research Dossier

**Document Classification:** Mission Architecture & Ground Truth Dataset  
**Target Institutions:** Maharishi Markandeshwar (Deemed to be University) Mullana & MMU Sadopur  
**Author:** Principal Full-Stack Geospatial Systems Architect  
**Status:** Grounded & Validated  

---

## 1. Institutional Identity & Digital Assets

### 1.1 Institutional Overview
Maharishi Markandeshwar (Deemed to be University), Mullana-Ambala (accredited NAAC Grade A++), is a premier multidisciplinary research and educational institution established in 1993 under Section 3 of the UGC Act, 1956. The university operates an extensive transport logistics fleet of 84+ dedicated air-conditioned and deluxe coaches providing daily student, resident physician, faculty, and administrative staff transit across three states (Haryana, Punjab, Chandigarh UT) covering over a 90-kilometer radius.

### 1.2 Official Portals & Digital Real Estate
- **Main Institutional Portal:** `https://www.mmumullana.org`
- **MMU Sadopur Campus Portal:** `https://www.mmambala.org`
- **Medical Sciences & Hospital Portal:** `https://mmcmsr.mmambala.org`
- **Student ERP / LMS Portal:** `https://erp.mmumullana.org`
- **Central Logistic & Fleet Control Office:** Transport Department, MMU Campus Central Garage, Mullana (Ambala), Haryana 133207

### 1.3 Official Contact Information & Helplines
- **University EPABX Trunk Lines:** +91-1731-274475, +91-1731-274476, +91-1731-274477, +91-1731-274478
- **Toll-Free National Helpline:** 1800 2740 240
- **Transport & Emergency Logistics Office:** +91-1731-304100 / ext. 288 (Fleet Dispatcher Desk)
- **Central Support Email:** `info@mmumullana.org`, `transport@mmumullana.org`

---

## 2. Institutional Brand Tokens & Palette Specifications

The visual identity relies on institutional crimson red accented by deep academic navy blue, heraldic gold, and crisp clean surfaces.

| Token Name | Hex Code | RGB | Purpose |
| :--- | :--- | :--- | :--- |
| `--mmu-primary-red` | `#E21E26` | `rgb(226, 30, 38)` | Primary brand color, headers, CTAs, alert accents |
| `--mmu-crimson-dark` | `#B71219` | `rgb(183, 18, 25)` | Hover states, hero banners, dark contrast elements |
| `--mmu-navy-dark` | `#0D1B3E` | `rgb(13, 27, 62)` | Primary dark mode base, 3D viewport canvas, typography |
| `--mmu-navy-deep` | `#060C1B` | `rgb(6, 12, 27)` | Cockpit background, status bar, high-contrast panels |
| `--mmu-gold-accent` | `#F59E0B` | `rgb(245, 158, 11)` | Crest accents, warning badges, highlighted stops |
| `--mmu-gold-bright` | `#FBBF24` | `rgb(251, 191, 36)` | Active bus route line glow, ETA badges |
| `--mmu-slate-surface` | `#1E293B` | `rgb(30, 41, 59)` | Card backgrounds, drawer panels, telemetry gauges |
| `--mmu-slate-border` | `#334155` | `rgb(51, 65, 85)` | Glassmorphism borders, separators |
| `--mmu-emerald-live` | `#10B981` | `rgb(16, 185, 129)` | Live WebSocket streaming status, on-time indicators |
| `--mmu-amber-delay` | `#F97316` | `rgb(249, 115, 22)` | Traffic delay indicators, minor route deviations |
| `--mmu-pure-white` | `#FFFFFF` | `rgb(255, 255, 255)` | Light mode cards, high-contrast labels |

### 2.1 Asset References
- Local Raster Logo: `assets/branding/mmu_logo.png` (Direct archive.org source, 18.7 KB)
- Local Vector Crest & Typographic Logo: `assets/branding/mmu_logo.svg` (Resolution-independent SVG)

---

## 3. Geospatial Boundaries & Campus Ground Truth

### 3.1 Main Campus: MMU Mullana (Ambala, Haryana)
- **Centroid Coordinates:** `30.250450° N, 77.045050° E`
- **Elevation:** ~264 m above MSL
- **Campus Area:** 180+ acres on NH-344 (Old NH-73, Ambala-Jagadhri-Panchkula Expressway)
- **Geographic Bounding Box:**
  - South-West: `30.245000° N, 77.039000° E`
  - North-East: `30.257000° N, 77.052000° E`

#### Key Campus Landmark Waypoints:
1. **Main Highway Gate (NH-344 Entrance):** `[30.252010, 77.043520]`
   - Primary security checkpoint, bus entry/exit gate, passenger turnaround circle.
2. **MM Institute of Medical Sciences & Research (Hospital Block 36):** `[30.251240, 77.048210]`
   - 850-bed multi-specialty teaching hospital, doctors' boarding bay, patient transit.
3. **Super-Specialty Cardiac & Cancer Hospital (Block 34):** `[30.250780, 77.049120]`
   - Dedicated medical staff parking and emergency transport bay.
4. **University Administrative Secretariat (Block 39):** `[30.249820, 77.046540]`
   - Vice Chancellor's Secretariat, Registrar Office, Student Finance & Transport ID Counter.
5. **Engineering & Technology Complex (MMEC Blocks 1, 2, 3 - Blocks 10, 14, 6):** `[30.248530, 77.044020]`
   - Major student disembarkation zone with 8 sheltered bus bays.
6. **Central Auditorium & Convention Center (Block 53):** `[30.251050, 77.045580]`
   - 2,500-seat university auditorium.
7. **MM Institute of Computer Applications & Hotel Management (Block 54):** `[30.249150, 77.042890]`
8. **Student Residential Township (BH-1, BH-5, BH-10):** `[30.246980, 77.043120]`
9. **Girls Residential Hostels (GH-3, GH-4, GH-6, GH-8):** `[30.248100, 77.047580]`
10. **MMU International Sports Complex & Cricket Stadium (Block 32):** `[30.252480, 77.047050]`

---

### 3.2 Satellite Campus: MMU Sadopur (Ambala, Haryana)
- **Centroid Coordinates:** `30.342900° N, 76.814200° E`
- **Location:** Ambala-Chandigarh Highway (NH-152), near Omaxe City, Sadopur, Ambala, Haryana 134007
- **Elevation:** ~272 m above MSL
- **Campus Stoppage Waypoint:** `[30.342920, 76.814180]` (Sadopur Academic Gate Bay)

---

## 4. Regional Transit Corridors & Stoppage Datasets

The MMU Central Transport Logistics network divides fleet movement into 5 primary regional arterial corridors:

### Corridor A: Ambala Cantt & City Express (Route ID: `ROUTE-AMB-01`)
- **Origin:** Ambala Cantt Railway Station Bus Bay (`30.332680, 76.837560`)
- **Key Intermediary Stops:**
  1. Ambala Cantt Junction Railway Station (`30.332680, 76.837560`)
  2. Gandhi Ground / Subhash Park (`30.341250, 76.833120`)
  3. Mahesh Nagar Police Station Chowk (`30.329810, 76.852430`)
  4. Babyal Village Turn (`30.318490, 76.883710`)
  5. Saha Industrial Junction / NH-344 Flyover (`30.264100, 76.994200`)
  6. Kalpi Bus Shelter (`30.258900, 77.018300`)
  7. MMU Mullana Main Highway Gate (`30.252010, 77.043520`)
  8. MMEC Bus Terminal (Campus Terminus) (`30.248530, 77.044020`)
- **Average Distance:** 29.4 km | **Nominal Transit Duration:** 48 minutes

### Corridor B: Yamunanagar & Jagadhri Line (Route ID: `ROUTE-YNR-02`)
- **Origin:** Yamunanagar Workshop Chowk (`30.134200, 77.288900`)
- **Key Intermediary Stops:**
  1. Yamunanagar Workshop Chowk (`30.134200, 77.288900`)
  2. Jagadhri Old Bus Stand (`30.165400, 77.298100`)
  3. Madhu Chowk Jagadhri (`30.158100, 77.279800`)
  4. Aurangabad Highway Halt (`30.183400, 77.215600`)
  5. Saraswati Nagar (Mustafabad) Crossing (`30.208900, 77.151200`)
  6. Dosarka Toll Junction (`30.231200, 77.089400`)
  7. MMU Mullana Hospital Entrance (`30.251240, 77.048210`)
  8. MMEC Engineering Bus Terminal (`30.248530, 77.044020`)
- **Average Distance:** 34.2 km | **Nominal Transit Duration:** 54 minutes

### Corridor C: Kurukshetra & Shahbad Route (Route ID: `ROUTE-KKR-03`)
- **Origin:** Kurukshetra New Bus Stand (`29.969800, 76.878400`)
- **Key Intermediary Stops:**
  1. Kurukshetra New Bus Stand / Sector 10 (`29.969800, 76.878400`)
  2. Pipli GT Road Chowk (`29.979200, 76.914500`)
  3. Shahbad Markanda Old GT Road Chowk (`30.167800, 76.871200`)
  4. Barara Railway Station Crossing (`30.207800, 77.034100`)
  5. Mullana Railway Crossing (`30.241200, 77.040100`)
  6. MMU Mullana Highway Gate (`30.252010, 77.043520`)
- **Average Distance:** 41.8 km | **Nominal Transit Duration:** 62 minutes

### Corridor D: Chandigarh - Sadopur - Mullana Intercampus Corridor (Route ID: `ROUTE-CHD-04`)
- **Origin:** Chandigarh Tribune Chowk / Sector 31 (`30.702800, 76.792500`)
- **Key Intermediary Stops:**
  1. Chandigarh Tribune Chowk (`30.702800, 76.792500`)
  2. Zirakpur Highway Flyover (`30.643200, 76.818900`)
  3. Dera Bassi Main Chowk (`30.584100, 76.845600`)
  4. MMU Sadopur Campus Terminal (`30.342900, 76.814200`)
  5. Ambala Cantt Flyover Bypass (`30.315000, 76.862000`)
  6. Saha Chowk (`30.264100, 76.994200`)
  7. MMU Mullana Main Campus (`30.250450, 77.045050`)
- **Average Distance:** 68.5 km | **Nominal Transit Duration:** 95 minutes

---

## 5. System Environmental Constraints & Realities

1. **Cellular Connectivity Blackspots:** Portions of NH-344 between Saha and Kalpi experience momentary 4G handoffs. The driver terminal MUST implement local SQLite buffering with guaranteed-delivery queue semantics (`WAL` mode + timestamp monotonic sequence).
2. **GPS Satellite Masking:** Dense campus foliage and multi-story hostel quad structures induce multipath interference. The client telemetry engine must apply a Kalman filter or windowed least-squares velocity-bearing smoothing before publishing coordinates to Mapbox/MapLibre GL.
3. **Dual-Campus Multi-Tenant Fleet Allocation:** A subset of buses run morning feeder runs to Sadopur, then transfer to Mullana for midday shifts. Route schemas must support dynamic route rebinding without killing historical trip telemetry.
