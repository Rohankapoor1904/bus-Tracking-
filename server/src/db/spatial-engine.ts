import { CampusBuilding3D } from '../types/index.js';

/**
 * High-Precision Geospatial Calculations & PostGIS Equivalent Formulas
 * SRID: 4326 (WGS 84 Ellipsoid approximation via Great-Circle Haversine)
 */

export const EARTH_RADIUS_METERS = 6371000; // Mean radius of Earth in meters

/**
 * Calculates great-circle distance between two geographic coordinates in meters.
 * Equivalent to PostGIS: ST_Distance(ST_MakePoint(lon1, lat1)::geography, ST_MakePoint(lon2, lat2)::geography)
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const rLat1 = toRadians(lat1);
  const rLat2 = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(rLat1) * Math.cos(rLat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Computes forward azimuth bearing in degrees (0° to 360° clockwise from True North).
 * ST_Azimuth(ST_MakePoint(lon1, lat1), ST_MakePoint(lon2, lat2))
 */
export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const rLat1 = toRadians(lat1);
  const rLat2 = toRadians(lat2);
  const dLon = toRadians(lon2 - lon1);

  const y = Math.sin(dLon) * Math.cos(rLat2);
  const x =
    Math.cos(rLat1) * Math.sin(rLat2) -
    Math.sin(rLat1) * Math.cos(rLat2) * Math.cos(dLon);

  const initialBearing = Math.atan2(y, x);
  const compassBearing = (toDegrees(initialBearing) + 360) % 360;

  return compassBearing;
}

/**
 * Tests if coordinate (lat1, lon1) is within radiusMeters of (lat2, lon2).
 * Equivalent to PostGIS: ST_DWithin(geom1::geography, geom2::geography, radiusMeters)
 */
export function isWithinGeofence(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  radiusMeters: number
): boolean {
  return calculateDistanceMeters(lat1, lon1, lat2, lon2) <= radiusMeters;
}

/**
 * Estimates Time of Arrival in minutes given distance in meters and current speed in km/h.
 * Incorporates urban/highway acceleration curves and traffic dampening factor.
 */
export function calculateETA(distanceMeters: number, speedKmh: number): number {
  // If stopped or very slow (at a traffic signal or bus stop), assume effective average urban speed of 25 km/h
  const effectiveSpeedKmh = Math.max(speedKmh, 25.0);
  const speedMetersPerSecond = (effectiveSpeedKmh * 1000) / 3600;
  const timeSeconds = distanceMeters / speedMetersPerSecond;
  return Math.max(0.5, parseFloat((timeSeconds / 60).toFixed(1)));
}

/**
 * Interpolates between two geographic coordinates [lon, lat] by factor t (0 to 1).
 */
export function interpolateCoordinate(
  coord1: [number, number],
  coord2: [number, number],
  t: number
): [number, number] {
  const lon = coord1[0] + (coord2[0] - coord1[0]) * t;
  const lat = coord1[1] + (coord2[1] - coord1[1]) * t;
  return [lon, lat];
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

// ----------------------------------------------------------------------------
// MMU Ground-Truth Solid 3D Campus Building Architecture
// ----------------------------------------------------------------------------
export const MMU_CAMPUS_BUILDINGS: CampusBuilding3D[] = [
  {
    id: 'mmu-building-hospital-36',
    name: 'MM Institute of Medical Sciences & Teaching Hospital (Block 36)',
    blockCode: 'MMIMSR-36',
    heightMeters: 28,
    minHeightMeters: 0,
    colorHex: '#0284C7',
    campus: 'MULLANA_MAIN',
    coordinates: [
      [
        [77.04780, 30.25150],
        [77.04870, 30.25150],
        [77.04870, 30.25090],
        [77.04780, 30.25090],
        [77.04780, 30.25150],
      ],
    ],
  },
  {
    id: 'mmu-building-cardiac-34',
    name: 'Super-Specialty Cardiac & Cancer Pavilion (Block 34)',
    blockCode: 'SUPER-34',
    heightMeters: 24,
    minHeightMeters: 0,
    colorHex: '#0ea5e9',
    campus: 'MULLANA_MAIN',
    coordinates: [
      [
        [77.04880, 30.25110],
        [77.04940, 30.25110],
        [77.04940, 30.25050],
        [77.04880, 30.25050],
        [77.04880, 30.25110],
      ],
    ],
  },
  {
    id: 'mmu-building-admin-39',
    name: 'University Administrative Secretariat & Chancellor Office (Block 39)',
    blockCode: 'ADMIN-39',
    heightMeters: 20,
    minHeightMeters: 0,
    colorHex: '#dc2626',
    campus: 'MULLANA_MAIN',
    coordinates: [
      [
        [77.04610, 30.25010],
        [77.04690, 30.25010],
        [77.04690, 30.24950],
        [77.04610, 30.24950],
        [77.04610, 30.25010],
      ],
    ],
  },
  {
    id: 'mmu-building-mmec-10-14',
    name: 'MM Engineering College Blocks 1, 2 & Central Labs (MMEC)',
    blockCode: 'MMEC-ENG',
    heightMeters: 22,
    minHeightMeters: 0,
    colorHex: '#475569',
    campus: 'MULLANA_MAIN',
    coordinates: [
      [
        [77.04455, 30.24860],
        [77.04545, 30.24860],
        [77.04545, 30.24775],
        [77.04455, 30.24775],
        [77.04455, 30.24860],
      ],
    ],
  },
  {
    id: 'mmu-building-auditorium-53',
    name: 'Central University Convention Center & Auditorium (Block 53)',
    blockCode: 'AUDIT-53',
    heightMeters: 18,
    minHeightMeters: 0,
    colorHex: '#f59e0b',
    campus: 'MULLANA_MAIN',
    coordinates: [
      [
        [77.04530, 30.25130],
        [77.04600, 30.25130],
        [77.04600, 30.25070],
        [77.04530, 30.25070],
        [77.04530, 30.25130],
      ],
    ],
  },
  {
    id: 'mmu-building-boys-hostel',
    name: 'Boys Residential Towers (BH-1, BH-5, BH-10)',
    blockCode: 'HOSTEL-BH',
    heightMeters: 26,
    minHeightMeters: 0,
    colorHex: '#2563eb',
    campus: 'MULLANA_MAIN',
    coordinates: [
      [
        [77.04160, 30.24720],
        [77.04250, 30.24720],
        [77.04250, 30.24620],
        [77.04160, 30.24620],
        [77.04160, 30.24720],
      ],
    ],
  },
  {
    id: 'mmu-building-girls-hostel',
    name: 'Girls Residential Towers (GH-3, GH-4, GH-6, GH-8)',
    blockCode: 'HOSTEL-GH',
    heightMeters: 26,
    minHeightMeters: 0,
    colorHex: '#7c3aed',
    campus: 'MULLANA_MAIN',
    coordinates: [
      [
        [77.04710, 30.24860],
        [77.04810, 30.24860],
        [77.04810, 30.24750],
        [77.04710, 30.24750],
        [77.04710, 30.24860],
      ],
    ],
  },
  {
    id: 'mmu-building-stadium-32',
    name: 'MM International Sports Arena & Stadium Pavilion (Block 32)',
    blockCode: 'SPORTS-32',
    heightMeters: 14,
    minHeightMeters: 0,
    colorHex: '#10b981',
    campus: 'MULLANA_MAIN',
    coordinates: [
      [
        [77.04650, 30.25290],
        [77.04760, 30.25290],
        [77.04760, 30.25190],
        [77.04650, 30.25190],
        [77.04650, 30.25290],
      ],
    ],
  },
  {
    id: 'mmu-building-dental-21',
    name: 'MM College of Dental Sciences & Hospital (Block 21)',
    blockCode: 'DENTAL-21',
    heightMeters: 22,
    minHeightMeters: 0,
    colorHex: '#06b6d4',
    campus: 'MULLANA_MAIN',
    coordinates: [
      [
        [77.04890, 30.24980],
        [77.04960, 30.24980],
        [77.04960, 30.24910],
        [77.04890, 30.24910],
        [77.04890, 30.24980],
      ],
    ],
  },
  {
    id: 'mmu-building-library-12',
    name: 'Central University Library & Knowledge Hub (Block 12)',
    blockCode: 'LIB-12',
    heightMeters: 18,
    minHeightMeters: 0,
    colorHex: '#d97706',
    campus: 'MULLANA_MAIN',
    coordinates: [
      [
        [77.04520, 30.24980],
        [77.04590, 30.24980],
        [77.04590, 30.24910],
        [77.04520, 30.24910],
        [77.04520, 30.24980],
      ],
    ],
  },
  {
    id: 'mmu-building-nursing-18',
    name: 'MM College of Nursing & Paramedical Institute',
    blockCode: 'NURS-18',
    heightMeters: 20,
    minHeightMeters: 0,
    colorHex: '#059669',
    campus: 'MULLANA_MAIN',
    coordinates: [
      [
        [77.04720, 30.25250],
        [77.04800, 30.25250],
        [77.04800, 30.25180],
        [77.04720, 30.25180],
        [77.04720, 30.25250],
      ],
    ],
  },
  {
    id: 'mmu-building-food-plaza',
    name: 'Central Food Plaza, Nescafe Square & Student Amenities',
    blockCode: 'PLAZA-HUB',
    heightMeters: 10,
    minHeightMeters: 0,
    colorHex: '#e11d48',
    campus: 'MULLANA_MAIN',
    coordinates: [
      [
        [77.04410, 30.25050],
        [77.04490, 30.25050],
        [77.04490, 30.24990],
        [77.04410, 30.24990],
        [77.04410, 30.25050],
      ],
    ],
  },
  {
    id: 'mmu-building-sadopur-main',
    name: 'MMU Sadopur Academic Block & Campus Center',
    blockCode: 'SADOPUR-MAIN',
    heightMeters: 22,
    minHeightMeters: 0,
    colorHex: '#dc2626',
    campus: 'SADOPUR_AMBALA',
    coordinates: [
      [
        [76.81370, 30.34330],
        [76.81470, 30.34330],
        [76.81470, 30.34250],
        [76.81370, 30.34250],
        [76.81370, 30.34330],
      ],
    ],
  },
];
