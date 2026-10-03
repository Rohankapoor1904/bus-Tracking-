import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Route, RouteStop, LiveBusState } from '../../types/index.js';
import { VehicleLerpEngine } from './VehicleLerpEngine.js';
import { getRoadSnappedPath } from '../../services/roadRouter.js';
import bakedRoutesData from '../../services/baked-routes.json';
import {
  Navigation,
  Layers,
  MapPin,
  Map as MapIcon,
  Building2,
  LocateFixed,
  Globe,
  Milestone,
  AlertCircle,
  X,
  Maximize,
  Minimize,
  Flag,
} from 'lucide-react';

const bakedRoutes = bakedRoutesData as unknown as Record<string, [number, number][]>;

export type MapStyleType = 'GOOGLE_ROADMAP' | 'GOOGLE_SATELLITE' | 'GOOGLE_3D' | 'DARK_COCKPIT';
export type BuildingViewMode = 'SOLID' | 'GLASS' | 'OFF';

// Genuine Official Google Maps Roadmap Specification
const GOOGLE_ROADMAP_SPEC: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    'google-roadmap': {
      type: 'raster',
      tiles: [
        'https://mt0.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}',
        'https://mt1.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}',
        'https://mt2.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}',
        'https://mt3.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}',
      ],
      tileSize: 256,
      attribution: '© Google Maps',
      maxzoom: 22,
    },
  },
  layers: [
    {
      id: 'google-roadmap-tiles',
      type: 'raster',
      source: 'google-roadmap',
      minzoom: 0,
      maxzoom: 22,
    },
  ],
};

// Genuine Official Google Maps Hybrid Satellite Specification
const GOOGLE_SATELLITE_SPEC: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    'google-hybrid': {
      type: 'raster',
      tiles: [
        'https://mt0.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}',
        'https://mt1.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}',
        'https://mt2.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}',
        'https://mt3.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}',
      ],
      tileSize: 256,
      attribution: '© Google Maps Satellite',
      maxzoom: 22,
    },
  },
  layers: [
    {
      id: 'google-hybrid-tiles',
      type: 'raster',
      source: 'google-hybrid',
      minzoom: 0,
      maxzoom: 22,
    },
  ],
};

interface MapLibre3DViewProps {
  activeRoute?: Route | null;
  activeBus?: LiveBusState | null;
  allBuses?: LiveBusState[];
  selectedStop?: RouteStop | null;
  onSelectBus?: (bus: LiveBusState) => void;
  onSelectStop?: (stop: RouteStop) => void;
  isCockpitMode?: boolean;
}

const DEFAULT_CENTER: [number, number] = [77.04505, 30.25045]; // MMU Mullana Campus
const PITCH_3D = 60; // Google Maps 3D immersion perspective: 60deg
const PITCH_FLAT = 0;

interface UserGeoState {
  coords: [number, number];
  isDelhiOrRemote: boolean;
  distanceKm: number;
  label: string;
}

// ── Marching-ants dash sequence: emulates a moving 3-unit dash along the
// route (conveyor-belt direction indicator). Each entry is one animation
// frame of line-dasharray; stepping through them shifts the dash phase.
const DASH_MARCH_SEQUENCE: number[][] = [
  [0, 4, 3],
  [0.5, 4, 2.5],
  [1, 4, 2],
  [1.5, 4, 1.5],
  [2, 4, 1],
  [2.5, 4, 0.5],
  [3, 4, 0],
  [0, 0.5, 3, 3.5],
  [0, 1, 3, 3],
  [0, 1.5, 3, 2.5],
  [0, 2, 3, 2],
  [0, 2.5, 3, 1.5],
  [0, 3, 3, 1],
  [0, 3.5, 3, 0.5],
];
const FLOW_STEP_MS = 85;

// Cinematic sky / atmospheric haze for the vector styles
const SKY_DAY: any = {
  'sky-color': '#3B82C4',
  'sky-horizon-blend': 0.6,
  'horizon-color': '#EADCC2',
  'horizon-fog-blend': 0.7,
  'fog-color': '#BCC9D8',
  'fog-ground-blend': 0.12,
  'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 8, 1, 13, 0.5],
};

// Warm sandstone ramp (kept for reference; BUILDING_COLOR_VARIED is used below)
const BUILDING_COLOR_RAMP: any = [
  'interpolate', ['linear'],
  ['coalesce', ['get', 'render_height'], ['get', 'height'], 6],
  0, '#eadfc6', 10, '#dbcaa6', 25, '#bfa478', 50, '#8e7a5a',
];

// Google Earth-style per-building colour variety — feature ID modulo gives each
// structure a distinct but consistent tint, simulating varied rooftop materials
// visible in satellite imagery. Height tier keeps tall blocks darker.
const BUILDING_COLOR_VARIED: any = [
  'case',
  // Tall (> 25 m) — deep umber/terracotta
  ['>', ['coalesce', ['get', 'render_height'], ['get', 'height'], 0], 25],
  ['case',
    ['==', ['%', ['id'], 3], 0], '#a89062',
    ['==', ['%', ['id'], 3], 1], '#b39870',
    '#bfa478'
  ],
  // Medium (> 10 m) — mid warm stone
  ['>', ['coalesce', ['get', 'render_height'], ['get', 'height'], 0], 10],
  ['case',
    ['==', ['%', ['id'], 4], 0], '#ceb48a',
    ['==', ['%', ['id'], 4], 1], '#d8c09a',
    ['==', ['%', ['id'], 4], 2], '#c4aa80',
    '#d0bc90'
  ],
  // Short / default — pale cream spectrum
  ['case',
    ['==', ['%', ['id'], 5], 0], '#ede0c6',
    ['==', ['%', ['id'], 5], 1], '#e5d5b5',
    ['==', ['%', ['id'], 5], 2], '#f2e4cc',
    ['==', ['%', ['id'], 5], 3], '#e8d8be',
    '#ead4b8'
  ]
];

const SKY_NIGHT: any = {
  'sky-color': '#050D1F',
  'sky-horizon-blend': 0.5,
  'horizon-color': '#16233B',
  'horizon-fog-blend': 0.5,
  'fog-color': '#0A1526',
  'fog-ground-blend': 0.15,
  'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 8, 1, 13, 0.55],
};

// Rural Punjab/Haryana land is almost empty in OSM tiles (farm plots are not
// mapped as polygons), so vector styles render it as blank cream — including
// right around the Ambala–MMU corridor. This generated farmland mosaic sits
// under every real layer and gives that land a soft patchwork texture.
// [west, south, east, north] — spans the full corridor plus panning margin.
const TERRAIN_BOX: [number, number, number, number] = [76.25, 29.8, 77.85, 30.9];
let terrainDataUrlCache: string | null = null;

function buildTerrainTexture(): string | null {
  if (terrainDataUrlCache) return terrainDataUrlCache;
  try {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#f0eedd';
    ctx.fillRect(0, 0, size, size);
    const palette = [
      '#e7ecd2', '#e2e7cb', '#edf0d6', '#e5e2c4', '#dfe5c9',
      '#eae6ce', '#e3ead1', '#eee9d2', '#e6ebd6', '#e9e4c9',
    ];
    // Deterministic seed — same mosaic on every reload
    let seed = 1337;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    // 1024 px over a 154 km box => ~150 m/px. Keep blobs small (≈2–8 km) so the
    // tint reads as micro-relief grain, not giant flat colour fields.
    for (let i = 0; i < 1050; i++) {
      const cx = rnd() * size;
      const cy = rnd() * size;
      const w = 14 + rnd() * 38;
      const h = 12 + rnd() * 32;
      const j1 = (rnd() - 0.5) * 20;
      const j2 = (rnd() - 0.5) * 20;
      const j3 = (rnd() - 0.5) * 20;
      const j4 = (rnd() - 0.5) * 20;
      ctx.fillStyle = palette[(rnd() * palette.length) | 0];
      ctx.globalAlpha = 0.42 + rnd() * 0.34;
      // 3×3 wrap so the texture tiles seamlessly across the box
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const x = cx + ox * size;
          const y = cy + oy * size;
          ctx.beginPath();
          ctx.moveTo(x - w / 2 + j1, y - h / 2 + j2);
          ctx.lineTo(x + w / 2 + j1, y - h / 2 + j3);
          ctx.lineTo(x + w / 2 + j4, y + h / 2 + j3);
          ctx.lineTo(x - w / 2 + j4, y + h / 2 + j2);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
    terrainDataUrlCache = canvas.toDataURL('image/png');
    return terrainDataUrlCache;
  } catch {
    return null;
  }
}

// Field-scale farm mosaic (real polygons, so it stays crisp at every zoom —
// the raster tint above is only ~75 m/px and would blur out at street zoom).
// Jittered shared-vertex grid => organic plot boundaries with no seams.
// [west, south, east, north] — corridor + panning margin.
const FIELDS_BOX: [number, number, number, number] = [76.58, 29.98, 77.42, 30.64];
let fieldMosaicCache: any = null;

function buildFieldMosaic(): any {
  if (fieldMosaicCache) return fieldMosaicCache;
  let seed = 987654321;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const [w, s, e, n] = FIELDS_BOX;
  const buildAxis = (start: number, end: number, minStep: number, maxStep: number) => {
    const axis: number[] = [start];
    let v = start;
    while (v < end - minStep) {
      v += minStep + rnd() * (maxStep - minStep);
      axis.push(Math.min(v, end));
    }
    if (axis[axis.length - 1] < end) axis.push(end);
    return axis;
  };
  const cols = buildAxis(w, e, 0.0026, 0.0075); // ≈250–720 m plots
  const rows = buildAxis(s, n, 0.0022, 0.0068); // ≈245–755 m plots
  const nI = cols.length;
  const nJ = rows.length;
  // Shared jittered vertices (interior only) so adjacent plots never gap
  const V: [number, number][][] = [];
  for (let i = 0; i < nI; i++) {
    V.push([]);
    for (let j = 0; j < nJ; j++) {
      const stepX = i === 0 ? cols[1] - cols[0] : i === nI - 1 ? cols[nI - 1] - cols[nI - 2] : Math.min(cols[i] - cols[i - 1], cols[i + 1] - cols[i]);
      const stepY = j === 0 ? rows[1] - rows[0] : j === nJ - 1 ? rows[nJ - 1] - rows[nJ - 2] : Math.min(rows[j] - rows[j - 1], rows[j + 1] - rows[j]);
      const inner = i > 0 && i < nI - 1 && j > 0 && j < nJ - 1;
      V[i].push([
        cols[i] + (inner ? (rnd() - 0.5) * stepX * 0.7 : 0),
        rows[j] + (inner ? (rnd() - 0.5) * stepY * 0.7 : 0),
      ]);
    }
  }
  // Punjab crop palette: wheat, young crop, cane green, mustard, stubble, fallow
  const palette = [
    '#d2c390', '#c7bd7e', '#bdba74', '#b0b76b', '#cdc398', '#c0b177',
    '#b5b06b', '#d0c89a', '#a9b268', '#d8cda0', '#cabf88', '#babe7b',
    '#9fae5f', '#cfa95e', '#b7c47c', '#8ba557', '#a8b86e',
  ];
  const zoneColor = (za: number, zb: number) => {
    const h = (za * 73856093) ^ (zb * 19349663);
    return palette[Math.abs(h) % palette.length];
  };
  const features: any[] = [];
  for (let i = 0; i < nI - 1; i++) {
    for (let j = 0; j < nJ - 1; j++) {
      // Colour by ~1.2 km zone with 55 % noise => regional crop groupings
      const zc = zoneColor(Math.floor(i / 2), Math.floor(j / 2));
      const c = rnd() < 0.45 ? zc : palette[(rnd() * palette.length) | 0];
      features.push({
        type: 'Feature',
        properties: { c },
        geometry: {
          type: 'Polygon',
          coordinates: [[V[i][j], V[i + 1][j], V[i + 1][j + 1], V[i][j + 1], V[i][j]]],
        },
      });
    }
  }
  fieldMosaicCache = { type: 'FeatureCollection', features };
  return fieldMosaicCache;
}

// Village houses — OpenStreetMap has no building footprints anywhere in rural
// Punjab outside towns, so panning away from the campus/city showed empty
// fields. Deterministic clusters anchored at the real OSM place nodes and bus
// stops along the corridor restore an inhabited look at street zoom.
// [lon, lat, radiusMeters]
const VILLAGE_SITES: [number, number, number][] = [
  [77.03836, 30.21422, 250], // Barara (town)
  [77.03702, 30.18652, 170], // Adhoya
  [76.98210, 30.23401, 170], // Tandwal
  [76.87899, 30.35682, 170], // Babyal
  [76.87966, 30.38078, 150], // Boh
  [76.91352, 30.39050, 150], // Malan
  [76.90842, 30.37373, 150], // Khelan
  [76.88877, 30.36870, 140], // Ramgarh
  [76.91142, 30.38842, 150], // Jodhpur
  [77.04010, 30.24120, 190], // Mullana old town (railway crossing)
  [77.01830, 30.25890, 190], // Kalpi
  [76.99420, 30.26410, 230], // Saha
  [77.08940, 30.23120, 160], // Dosarka
  [77.15120, 30.20890, 180], // Mustafabad
  [77.21560, 30.18340, 160], // Aurangabad
];
// Built-up areas that already have real OSM footprints — keep farmsteads out.
const FARMSTEAD_KEEPOUT: [number, number, number][] = [
  [76.8375, 30.3327, 3800], // Ambala Cantt / city
  [76.8189, 30.6432, 2600], // Zirakpur
  [77.04505, 30.25045, 1600], // MMU Mullana campus
  [76.8142, 30.3429, 1200], // MMU Sadopur campus
  [76.8700, 29.9750, 2600], // Kurukshetra city
  [76.8712, 30.1678, 1400], // Shahbad Markanda
];
// Vegetation-only keepout: campuses are green spaces in reality, so canopy may
// run right up to their ring roads — only the built core stays clear. Without
// this the 1600 m campus keepout turns the default view into bare field.
const VEG_KEEPOUT: [number, number, number][] = [
  [76.8375, 30.3327, 3800], // Ambala Cantt / city
  [76.8189, 30.6432, 2600], // Zirakpur
  [77.04505, 30.25045, 480], // MMU Mullana campus core
  [76.8142, 30.3429, 380], // MMU Sadopur campus core
  [76.8700, 29.9750, 2600], // Kurukshetra city
  [76.8712, 30.1678, 1400], // Shahbad Markanda
];
// Extra canopy belts: campuses get a green boundary ring like the villages,
// which is what actually makes the default campus view read as landscaped.
const CAMPUS_BELT_SITES: [number, number, number][] = [
  [77.04505, 30.25045, 520], // MMU Mullana
  [76.8142, 30.3429, 400], // MMU Sadopur
];
const HOUSE_PALETTE = ['#eae3d4', '#e3d9c8', '#dcd1bd', '#e8dfce', '#d7cbb4', '#efe9db', '#cfc0a4', '#d9d2c4'];
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LON = 96420; // ≈ meters per degree lon at 30.2°N
let villageHousesCache: any = null;

function buildVillageHouses(): any {
  if (villageHousesCache) return villageHousesCache;
  let seed = 24681357;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const features: any[] = [];
  const pushHouse = (lon: number, lat: number, wM: number, dM: number, theta: number, hM: number) => {
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const corners: [number, number][] = [
      [-wM / 2, -dM / 2],
      [wM / 2, -dM / 2],
      [wM / 2, dM / 2],
      [-wM / 2, dM / 2],
    ];
    const ring = corners.map(([px, py]) => {
      const rx = px * cos - py * sin;
      const ry = px * sin + py * cos;
      return [lon + rx / M_PER_DEG_LON, lat + ry / M_PER_DEG_LAT] as [number, number];
    });
    ring.push(ring[0]);
    features.push({
      type: 'Feature',
      properties: { h: Math.round(hM * 10) / 10, c: HOUSE_PALETTE[(rnd() * HOUSE_PALETTE.length) | 0] },
      geometry: { type: 'Polygon', coordinates: [ring] },
    });
  };

  // Dense organic clusters at the village sites — jittered lane grid with a
  // main-bazaar street carved through the middle and courtyard gaps.
  for (const [lon, lat, rM] of VILLAGE_SITES) {
    const theta = rnd() * Math.PI;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const pitch = 16 + rnd() * 4;
    const half = Math.ceil(rM / pitch);
    for (let i = -half; i <= half; i++) {
      for (let j = -half; j <= half; j++) {
        const ex = i * pitch + (rnd() - 0.5) * pitch * 0.45;
        const ey = j * pitch + (rnd() - 0.5) * pitch * 0.45;
        if (ex * ex + ey * ey > rM * rM) continue;
        if (Math.abs(ex) < 15) continue; // main street
        if (rnd() < 0.16) continue; // courtyards / gaps
        const w = 8 + rnd() * 7;
        const d = 5.5 + rnd() * 4.5;
        const storey = rnd() < 0.12 ? 3.4 : 0; // some two-storey pucca houses
        pushHouse(
          lon + (ex * cosT - ey * sinT) / M_PER_DEG_LON,
          lat + (ex * sinT + ey * cosT) / M_PER_DEG_LAT,
          w, d,
          theta + (rnd() - 0.5) * 0.16,
          3.4 + rnd() * 2.6 + storey
        );
      }
    }
  }

  // Farmsteads (house + tube-well / cattle sheds) scattered through the fields
  // — in Punjab every few hundred metres of farmland has one, so mid-field
  // panning should never find empty fields. ~85 % of 0.0062° cells (≈ 580 m)
  // keeps 3–5 compounds in view at street zoom.
  const cell = 0.0062;
  for (let L = FIELDS_BOX[0]; L < FIELDS_BOX[2]; L += cell) {
    for (let B = FIELDS_BOX[1]; B < FIELDS_BOX[3]; B += cell) {
      if (rnd() > 0.85) continue;
      const cx = L + rnd() * cell;
      const cy = B + rnd() * cell;
      let blocked = false;
      for (const [kx, ky, kr] of FARMSTEAD_KEEPOUT) {
        const dx = (cx - kx) * M_PER_DEG_LON;
        const dy = (cy - ky) * M_PER_DEG_LAT;
        if (dx * dx + dy * dy < kr * kr) { blocked = true; break; }
      }
      if (!blocked) {
        for (const [vx, vy, vr] of VILLAGE_SITES) {
          const dx = (cx - vx) * M_PER_DEG_LON;
          const dy = (cy - vy) * M_PER_DEG_LAT;
          if (dx * dx + dy * dy < (vr + 60) * (vr + 60)) { blocked = true; break; }
        }
      }
      if (blocked) continue;
      const k = 2 + Math.floor(rnd() * 4);
      const th = rnd() * Math.PI;
      for (let q = 0; q < k; q++) {
        pushHouse(
          cx + (rnd() - 0.5) * 0.0005,
          cy + (rnd() - 0.5) * 0.00045,
          10 + rnd() * 9,
          7 + rnd() * 5,
          th + (rnd() - 0.5) * 0.7,
          3.4 + rnd() * 2.6
        );
      }
    }
  }

  villageHousesCache = { type: 'FeatureCollection', features };
  return villageHousesCache;
}

// ── Procedural vegetation ─────────────────────────────────────────────────
// Rural Punjab reads green: canopy is ~40 % of what a tilted 3D camera sees.
// Deterministic scatter — dense tree rings around the settlements, grove
// clumps through farmland (statistically the same cells as the farmsteads, so
// every compound gets its shade trees), plus sparse windbreak singles. One
// cheap circle layer; no geometry tessellation cost like the extrusions.
const TREE_PALETTE = ['#4a7c39', '#3f6f30', '#57893f', '#63954a'];
let vegetationCache: any = null;

function buildVegetation(): any {
  if (vegetationCache) return vegetationCache;
  let seed = 975312468;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const features: any[] = [];
  const pushTree = (lon: number, lat: number, r: number) => {
    features.push({
      type: 'Feature',
      properties: { c: TREE_PALETTE[(rnd() * TREE_PALETTE.length) | 0], r: Math.round(r * 10) / 10 },
      geometry: { type: 'Point', coordinates: [lon, lat] },
    });
  };
  const inKeepout = (lon: number, lat: number): boolean => {
    for (const [kx, ky, kr] of VEG_KEEPOUT) {
      const dx = (lon - kx) * M_PER_DEG_LON;
      const dy = (lat - ky) * M_PER_DEG_LAT;
      if (dx * dx + dy * dy < kr * kr) return true;
    }
    return false;
  };

  // Canopy belt hugging every village edge — trees ring the built-up core
  for (const [lon, lat, rM] of [...VILLAGE_SITES, ...CAMPUS_BELT_SITES]) {
    const pitch = 13;
    const outer = rM + 90;
    const half = Math.ceil(outer / pitch);
    for (let i = -half; i <= half; i++) {
      for (let j = -half; j <= half; j++) {
        const ex = i * pitch + (rnd() - 0.5) * pitch;
        const ey = j * pitch + (rnd() - 0.5) * pitch;
        const d2 = ex * ex + ey * ey;
        if (d2 < rM * rM * 0.9 || d2 > outer * outer) continue;
        if (rnd() < 0.58) continue;
        pushTree(lon + ex / M_PER_DEG_LON, lat + ey / M_PER_DEG_LAT, 3 + rnd() * 4.4);
      }
    }
  }

  // Grove clumps through the fields (co-located with farmstead density)
  const cell = 0.0062;
  for (let L = FIELDS_BOX[0]; L < FIELDS_BOX[2]; L += cell) {
    for (let B = FIELDS_BOX[1]; B < FIELDS_BOX[3]; B += cell) {
      if (rnd() > 0.72) continue;
      const cx = L + rnd() * cell;
      const cy = B + rnd() * cell;
      if (inKeepout(cx, cy)) continue;
      const k = 3 + Math.floor(rnd() * 5);
      for (let q = 0; q < k; q++) {
        pushTree(cx + (rnd() - 0.5) * 0.0013, cy + (rnd() - 0.5) * 0.0012, 3 + rnd() * 4.6);
      }
    }
  }

  // Sparse windbreak singles between plots
  const fcell = 0.0042;
  for (let L = FIELDS_BOX[0]; L < FIELDS_BOX[2]; L += fcell) {
    for (let B = FIELDS_BOX[1]; B < FIELDS_BOX[3]; B += fcell) {
      if (rnd() > 0.24) continue;
      const cx = L + rnd() * fcell;
      const cy = B + rnd() * fcell;
      if (inKeepout(cx, cy)) continue;
      pushTree(cx, cy, 2.6 + rnd() * 3.6);
    }
  }

  vegetationCache = { type: 'FeatureCollection', features };
  return vegetationCache;
}

// Avenue trees flanking the active corridor — Punjab highways are lined with
// them, and they visually anchor the route at street zoom.
function buildAvenueTrees(path: [number, number][]): any {
  const features: any[] = [];
  if (!path || path.length < 2) return { type: 'FeatureCollection', features };
  let seed = 13579246;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const [x0, y0] = path[i - 1];
    const [x1, y1] = path[i];
    const dxm = (x1 - x0) * M_PER_DEG_LON;
    const dym = (y1 - y0) * M_PER_DEG_LAT;
    const seg = Math.hypot(dxm, dym);
    if (seg < 1) continue;
    acc += seg;
    if (acc < 55) continue;
    acc = 0;
    const t = rnd();
    const lon = x0 + (x1 - x0) * t;
    const lat = y0 + (y1 - y0) * t;
    const nx = -dym / seg;
    const ny = dxm / seg;
    for (const side of [-1, 1]) {
      if (rnd() < 0.25) continue;
      const off = (11 + rnd() * 6) * side;
      features.push({
        type: 'Feature',
        properties: {
          c: TREE_PALETTE[(rnd() * TREE_PALETTE.length) | 0],
          r: Math.round((2.8 + rnd() * 3.4) * 10) / 10,
        },
        geometry: {
          type: 'Point',
          coordinates: [lon + (nx * off) / M_PER_DEG_LON, lat + (ny * off) / M_PER_DEG_LAT],
        },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

function isBusLive(bus?: LiveBusState | null): boolean {
  if (!bus) return false;
  return bus.status !== 'IDLE' && (bus.speedKmh || 0) > 0.5;
}

// Geodesic circle polygon (geofence visualisation ring)
function buildGeofenceCircle(
  center: [number, number],
  radiusMeters: number,
  kind: 'zone' | 'alert',
  points = 72
): any {
  const [lng, lat] = center;
  const km = radiusMeters / 1000;
  const dLng = km / (111.32 * Math.cos((lat * Math.PI) / 180));
  const dLat = km / 110.574;
  const ring: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const theta = (i / points) * Math.PI * 2;
    ring.push([lng + dLng * Math.cos(theta), lat + dLat * Math.sin(theta)]);
  }
  return {
    type: 'Feature',
    properties: { kind },
    geometry: { type: 'Polygon', coordinates: [ring] },
  };
}

export const MapLibre3DView: React.FC<MapLibre3DViewProps> = ({
  activeRoute,
  activeBus,
  allBuses = [],
  selectedStop,
  onSelectBus,
  onSelectStop,
  isCockpitMode = false,
}) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const busMarkerRef = useRef<maplibregl.Marker | null>(null);
  const busElRef = useRef<HTMLDivElement | null>(null);
  const busHeadingRef = useRef<HTMLDivElement | null>(null);
  const busLivenessRef = useRef<boolean>(false);
  const lastBusBearingRef = useRef<number>(0);
  const multiBusMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const stopMarkersRef = useRef<maplibregl.Marker[]>([]);
  const lerpEngineRef = useRef<VehicleLerpEngine | null>(null);
  const buildingLayerIdRef = useRef<string | null>(null);
  const buildingModeRef = useRef<BuildingViewMode>('SOLID');
  const roadPathRef = useRef<[number, number][] | null>(null);
  const routeColorRef = useRef<string>('#3B82F6');
  const selectedStopRef = useRef<RouteStop | null>(null);
  const mapStyleRef = useRef<MapStyleType>('GOOGLE_3D');
  const trailRef = useRef<{ routeId?: string; coords: [number, number][]; lastPush: number }>({
    routeId: undefined,
    coords: [],
    lastPush: 0,
  });
  const dashRafRef = useRef<number | null>(null);

  const [mapStyle, setMapStyle] = useState<MapStyleType>('GOOGLE_3D');
  const [buildingMode, setBuildingMode] = useState<BuildingViewMode>('SOLID');
  const [_userGeo, setUserGeo] = useState<UserGeoState | null>(null);
  const [geoNotice, setGeoNotice] = useState<{
    type: 'REMOTE_IP' | 'LOCATED';
    message: string;
    distKm: number;
  } | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);

  const [is3DMode, setIs3DMode] = useState<boolean>(true);
  const [isFollowingBus, setIsFollowingBus] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [mapLoaded, setMapLoaded] = useState<boolean>(false);
  const [currentSpeed, setCurrentSpeed] = useState<number>(0);
  const [currentBearing, setCurrentBearing] = useState<number>(0);
  const [mapBearing, setMapBearing] = useState<number>(28);
  // Instant baked street-snapped coordinates (0ms latency, zero drift off NH-344)
  const [roadPath, setRoadPath] = useState<[number, number][] | null>(() => {
    if (activeRoute && bakedRoutes[activeRoute.id]) return bakedRoutes[activeRoute.id];
    return null;
  });

  // Set user location puck directly to chosen coordinates (e.g. stop or campus)
  const setUserLocationToCoords = useCallback((coords: [number, number], title: string) => {
    const map = mapRef.current;
    if (!map) return;
    if (!userMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'user-location-pulse select-none pointer-events-none';
      el.title = title;
      el.innerHTML = `
        <div class="relative flex items-center justify-center">
          <span class="animate-ping absolute inline-flex h-10 w-10 rounded-full bg-cyan-400 opacity-75"></span>
          <span class="animate-ping absolute inline-flex h-14 w-14 rounded-full bg-cyan-400 opacity-30" style="animation-delay:0.4s"></span>
          <div class="relative flex items-center justify-center w-7 h-7 rounded-full bg-cyan-600 border-2 border-white shadow-2xl text-[10px] font-black text-white z-10">
            ME
          </div>
        </div>
      `;
      userMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat(coords)
        .addTo(map);
    } else {
      userMarkerRef.current.setLngLat(coords);
    }
    map.flyTo({ center: coords, zoom: 16.5, pitch: PITCH_3D, duration: 1100 });
    setGeoNotice(null);
  }, []);

  // Ref to track GPS watch ID for cleanup
  const geoWatchIdRef = useRef<number | null>(null);
  const geoFirstLockRef = useRef<boolean>(false);

  // Render / update the user location puck on the map
  const upsertUserMarker = useCallback((lng: number, lat: number, title: string) => {
    const map = mapRef.current;
    if (!map) return;
    if (!userMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'user-location-pulse select-none pointer-events-none';
      el.title = title;
      el.innerHTML = `
        <div class="relative flex items-center justify-center">
          <span class="animate-ping absolute inline-flex h-10 w-10 rounded-full bg-cyan-400 opacity-75"></span>
          <span class="animate-ping absolute inline-flex h-14 w-14 rounded-full bg-cyan-400 opacity-30" style="animation-delay:0.4s"></span>
          <div class="relative flex items-center justify-center w-7 h-7 rounded-full bg-cyan-600 border-2 border-white shadow-2xl text-[10px] font-black text-white z-10">
            ME
          </div>
        </div>
      `;
      userMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng, lat])
        .addTo(map);
    } else {
      userMarkerRef.current.setLngLat([lng, lat]);
    }
  }, []);

  // Active GPS watch — starts on mount, continuous authentic device tracking
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    geoFirstLockRef.current = false;

    geoWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const lng = pos.coords.longitude;
        const lat = pos.coords.latitude;
        const dLat = (lat - 30.25045) * 111.2;
        const dLon = (lng - 77.04505) * 96.3;
        const distKm = Math.round(Math.sqrt(dLat * dLat + dLon * dLon));

        setUserGeo({
          coords: [lng, lat],
          isDelhiOrRemote: distKm > 45,
          distanceKm: distKm,
          label: distKm <= 45 ? 'Near MMU Transit Route' : `Home / Device Location (~${distKm} km)`,
        });

        // Always show the user's authentic location marker on map
        upsertUserMarker(lng, lat, `Your GPS Position (${lat.toFixed(5)}, ${lng.toFixed(5)})`);

        // Auto-center on very first GPS fix
        if (!geoFirstLockRef.current) {
          geoFirstLockRef.current = true;
          setGeoNotice(null);
          const map = mapRef.current;
          if (map) {
            // If user is within 50 km, fly to their location
            if (distKm <= 50) {
              map.flyTo({ center: [lng, lat], zoom: 16.2, pitch: PITCH_3D, duration: 1400 });
            } else {
              // User is at home further away: show subtle banner but keep ME marker active
              setGeoNotice({
                type: 'REMOTE_IP',
                message: `📍 Located at your device location (~${distKm} km from campus). Tap 'Locate Me' or 'Fit Route' to navigate.`,
                distKm,
              });
            }
          }
        }
      },
      (err) => {
        console.warn('Geolocation watch notice:', err.message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 }
    );

    return () => {
      if (geoWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(geoWatchIdRef.current);
        geoWatchIdRef.current = null;
      }
    };
  }, [upsertUserMarker]);

  // Locate Me FAB — flies camera to user's exact device GPS position
  const checkUserLocation = useCallback((centerIfFound = false) => {
    const map = mapRef.current;
    // If we already have a user position, fly there immediately
    if (userMarkerRef.current) {
      const lngLat = userMarkerRef.current.getLngLat();
      if (map && centerIfFound) {
        map.flyTo({ center: [lngLat.lng, lngLat.lat], zoom: 16.5, pitch: PITCH_3D, duration: 1200 });
      }
      return;
    }
    // Otherwise request an immediate high-accuracy fix
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lng = pos.coords.longitude;
        const lat = pos.coords.latitude;
        upsertUserMarker(lng, lat, `Your GPS (${lat.toFixed(5)}, ${lng.toFixed(5)})`);
        if (map && centerIfFound) {
          map.flyTo({ center: [lng, lat], zoom: 16.5, pitch: PITCH_3D, duration: 1200 });
        }
      },
      (err) => console.warn('Locate Me lookup:', err.message),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  }, [upsertUserMarker]);

  // Dynamic Building View Mode Handler (Glass / Solid / Off)
  const handleBuildingModeChange = (next: BuildingViewMode) => {
    setBuildingMode(next);
    buildingModeRef.current = next;
    const map = mapRef.current;
    if (map) applyBuildingMode(map, next);
  };

  // Resolve the active corridor to real road geometry.
  // Immediate synchronous lookup from baked routes, or graceful OSRM network fetch.
  useEffect(() => {
    if (!activeRoute) {
      setRoadPath(null);
      return;
    }
    const routeId = activeRoute.id;
    if (bakedRoutes[routeId] && bakedRoutes[routeId].length > 1) {
      setRoadPath(bakedRoutes[routeId]);
      return;
    }
    if (activeRoute.stops.length < 2) return;
    const ctrl = new AbortController();
    const timeout = window.setTimeout(() => ctrl.abort(), 12000);
    let live = true;
    getRoadSnappedPath(routeId, activeRoute.stops, activeRoute.waypoints, ctrl.signal).then((path) => {
      if (live && path !== activeRoute.waypoints) setRoadPath(path);
    });
    return () => {
      live = false;
      window.clearTimeout(timeout);
      ctrl.abort();
    };
  }, [activeRoute]);

  const getStyleConfig = useCallback((style: MapStyleType): any => {
    if (style === 'GOOGLE_ROADMAP') return GOOGLE_ROADMAP_SPEC;
    if (style === 'GOOGLE_SATELLITE') return GOOGLE_SATELLITE_SPEC;
    if (style === 'GOOGLE_3D') return 'https://tiles.openfreemap.org/styles/bright';
    if (style === 'DARK_COCKPIT') return 'https://tiles.openfreemap.org/styles/dark';
    return GOOGLE_ROADMAP_SPEC;
  }, []);

  const applySunLighting = useCallback((map: maplibregl.Map) => {
    // Directional sun anchored to the map (not the viewport) so shadows stay
    // consistent as the user pans — same as Google Earth's fixed-sun behaviour.
    // Position tuned for ~10 am at Ambala latitude (30.25 N).
    try {
      map.setLight({
        anchor: 'map',
        color: '#FFF4E0',
        intensity: 0.72,
        position: [1.5, 210, 55],
      });
    } catch {
      /* older style without light support */
    }
  }, []);

  // Atmospheric sky dome — cinematic horizon glow on the vector styles
  const applySky = useCallback((map: maplibregl.Map, style: MapStyleType) => {
    try {
      const sky = style === 'DARK_COCKPIT' ? SKY_NIGHT : SKY_DAY;
      (map as any).setSky?.(sky);
    } catch {
      /* sky unsupported on this runtime */
    }
  }, []);

  // ── OVERLAY LAYER BUILDERS ───────────────────────────────────────────────
  // All builders are idempotent (remove-then-add) so they can be re-run after
  // every style switch without duplicating layers.

  const removeOverlayLayers = useCallback((map: maplibregl.Map) => {
    ['route-flow', 'route-glow', 'route-line', 'route-shadow', 'geofence-alert-line', 'geofence-zone-line', 'geofence-zone-fill'].forEach(
      (id) => {
        if (map.getLayer(id)) map.removeLayer(id);
      }
    );
    ['route-path', 'geofence-rings'].forEach((id) => {
      if (map.getSource(id)) map.removeSource(id);
    });
  }, []);

  const addRouteLayers = useCallback((map: maplibregl.Map, path: [number, number][], colorHex: string) => {
    ['route-flow', 'route-glow', 'route-line', 'route-shadow'].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource('route-path')) map.removeSource('route-path');
    if (!path || path.length < 2) return;

    try {
      map.addSource('route-path', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: path },
          properties: {},
        },
      });

      // Drop shadow for depth
      map.addLayer({
        id: 'route-shadow',
        type: 'line',
        source: 'route-path',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#000000',
          'line-width': 8,
          'line-opacity': 0.18,
          'line-blur': 3,
          'line-translate': [1, 2],
        },
      } as any);

      // Main route line
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route-path',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': colorHex,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 15, 6, 18, 9],
          'line-opacity': 0.92,
        },
      } as any);

      // Animated shimmer glow
      map.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'route-path',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': colorHex,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 7, 15, 14, 18, 20],
          'line-opacity': 0.12,
          'line-blur': 4,
        },
      } as any);

      // Marching-dash flow — direction-of-travel conveyor belt
      map.addLayer({
        id: 'route-flow',
        type: 'line',
        source: 'route-path',
        layout: { 'line-join': 'round', 'line-cap': 'butt' },
        paint: {
          'line-color': '#FFFFFF',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.4, 15, 2.2, 18, 3],
          'line-opacity': 0.85,
          'line-dasharray': DASH_MARCH_SEQUENCE[0],
        },
      } as any);
    } catch (e) {
      console.warn('Route line render error:', e);
    }
  }, []);

  const updateTrailSource = useCallback((map: maplibregl.Map, coords: [number, number][]) => {
    const feature =
      coords.length >= 2
        ? {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: coords },
            properties: {},
          }
        : { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} };

    if (!map.getSource('bus-trail-path')) {
      if (coords.length < 2) return;
      try {
        map.addSource('bus-trail-path', { type: 'geojson', data: feature as any });
        map.addLayer({
          id: 'bus-trail',
          type: 'line',
          source: 'bus-trail-path',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#F59E0B',
            'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 16, 4.5],
            'line-opacity': 0.4,
            'line-blur': 2,
          },
        } as any);
      } catch (e) {
        console.warn('Trail render error:', e);
      }
    } else {
      (map.getSource('bus-trail-path') as maplibregl.GeoJSONSource).setData(feature as any);
    }
  }, []);

  const addGeofenceLayers = useCallback((map: maplibregl.Map, stop: RouteStop | null) => {
    ['geofence-alert-line', 'geofence-zone-line', 'geofence-zone-fill'].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource('geofence-rings')) map.removeSource('geofence-rings');
    if (!stop) return;

    try {
      const features: any[] = [
        buildGeofenceCircle([stop.longitude, stop.latitude], Math.max(stop.geofenceRadiusMeters || 250, 60), 'zone'),
      ];
      // 1 km audible-alert boundary (only when it differs from the stop zone)
      if ((stop.geofenceRadiusMeters || 0) < 950) {
        features.push(buildGeofenceCircle([stop.longitude, stop.latitude], 1000, 'alert'));
      }
      map.addSource('geofence-rings', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features } as any,
      });

      const before = map.getLayer('route-shadow') ? 'route-shadow' : undefined;

      map.addLayer(
        {
          id: 'geofence-zone-fill',
          type: 'fill',
          source: 'geofence-rings',
          filter: ['==', ['get', 'kind'], 'zone'],
          paint: { 'fill-color': '#F59E0B', 'fill-opacity': 0.09 },
        } as any,
        before
      );

      map.addLayer(
        {
          id: 'geofence-zone-line',
          type: 'line',
          source: 'geofence-rings',
          filter: ['==', ['get', 'kind'], 'zone'],
          paint: {
            'line-color': '#F59E0B',
            'line-width': 1.6,
            'line-opacity': 0.85,
            'line-dasharray': [2, 1.5],
          },
        } as any,
        before
      );

      map.addLayer(
        {
          id: 'geofence-alert-line',
          type: 'line',
          source: 'geofence-rings',
          filter: ['==', ['get', 'kind'], 'alert'],
          paint: {
            'line-color': '#FBBF24',
            'line-width': 1.2,
            'line-opacity': 0.45,
            'line-dasharray': [1, 2],
          },
        } as any,
        before
      );
    } catch (e) {
      console.warn('Geofence ring render error:', e);
    }
  }, []);

  // Avenue trees flanking the corridor — regenerated per route, inserted
  // beneath the route shadow so the line glides over their edges.
  const syncAvenueTrees = useCallback((map: maplibregl.Map, path: [number, number][]) => {
    if (mapStyleRef.current === 'DARK_COCKPIT') return;
    if (!map.getSource('openmaptiles')) return;
    try {
      const data = buildAvenueTrees(path || []);
      if (!map.getSource('fleet-avenue-trees')) {
        if (!data.features.length) return;
        map.addSource('fleet-avenue-trees', { type: 'geojson', data } as any);
        const layers = map.getStyle().layers || [];
        const before = map.getLayer('route-shadow')
          ? 'route-shadow'
          : layers.find((l: any) => l.type === 'symbol' && l.layout?.['text-field'])?.id;
        map.addLayer(
          {
            id: 'fleet-avenue-trees',
            type: 'circle',
            source: 'fleet-avenue-trees',
            minzoom: 12.8,
            paint: {
              'circle-color': ['get', 'c'],
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 12.8, 1.3, 15, 2.6, 17, 5, 19, 8.5],
              'circle-opacity': ['interpolate', ['linear'], ['zoom'], 12.8, 0, 13.6, 0.9],
              'circle-blur': 0.25,
            },
          } as any,
          before
        );
      } else {
        (map.getSource('fleet-avenue-trees') as maplibregl.GeoJSONSource).setData(data as any);
      }
    } catch {
      /* style swap in flight */
    }
  }, []);

  // Re-apply live overlays after a style switch wipes custom layers
  const rebuildOverlays = useCallback(
    (map: maplibregl.Map) => {
      addRouteLayers(map, roadPathRef.current || [], routeColorRef.current);
      updateTrailSource(map, trailRef.current.coords);
      addGeofenceLayers(map, selectedStopRef.current);
      syncAvenueTrees(map, roadPathRef.current || []);
    },
    [addRouteLayers, updateTrailSource, addGeofenceLayers, syncAvenueTrees]
  );

  // Farmland mosaic underlay — keeps data-sparse rural land from reading as
  // blank void. Vector day styles only (dark theme and imagery styles opt out).
  const addTerrainLayer = useCallback((map: maplibregl.Map) => {
    if (mapStyleRef.current === 'DARK_COCKPIT') return;
    if (!map.getSource('openmaptiles')) return;
    try {
      if (map.getLayer('fleet-terrain')) map.removeLayer('fleet-terrain');
      if (map.getSource('fleet-terrain')) map.removeSource('fleet-terrain');
      const url = buildTerrainTexture();
      if (!url) return;
      map.addSource('fleet-terrain', {
        type: 'image',
        url,
        coordinates: [
          [TERRAIN_BOX[0], TERRAIN_BOX[3]],
          [TERRAIN_BOX[2], TERRAIN_BOX[3]],
          [TERRAIN_BOX[2], TERRAIN_BOX[1]],
          [TERRAIN_BOX[0], TERRAIN_BOX[1]],
        ],
      });
      const layers = map.getStyle().layers || [];
      const firstNonBg = layers.find((l: any) => l.id !== 'background')?.id;
      // Both farm layers fade in only past z10 — below that the style's own
      // regional landcover already reads fine and the box edges would show.
      map.addLayer(
        {
          id: 'fleet-terrain',
          type: 'raster',
          source: 'fleet-terrain',
          minzoom: 10,
          paint: {
            'raster-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0, 11, 0.6],
            'raster-fade-duration': 200,
          },
        } as any,
        firstNonBg
      );
      // Field-scale mosaic on top of the tint, still under every vector layer
      if (map.getLayer('fleet-fields')) map.removeLayer('fleet-fields');
      if (map.getSource('fleet-fields')) map.removeSource('fleet-fields');
      map.addSource('fleet-fields', { type: 'geojson', data: buildFieldMosaic() });
      map.addLayer(
        {
          id: 'fleet-fields',
          type: 'fill',
          source: 'fleet-fields',
          minzoom: 10,
          paint: {
            'fill-color': ['get', 'c'],
            'fill-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0, 11, 0.78],
            'fill-outline-color': [
              'interpolate', ['linear'], ['zoom'],
              10, 'rgba(160,148,105,0)',
              11, 'rgba(160,148,105,0.2)',
            ],
          },
        } as any,
        firstNonBg
      );
    } catch {
      /* style swap in flight */
    }
  }, []);

  // Procedural village houses — same opt-out rules as the farm layers; fades
  // in past z14.2 where the footprints become large enough to read.
  const addVillageHouseLayer = useCallback((map: maplibregl.Map) => {
    if (mapStyleRef.current === 'DARK_COCKPIT') return;
    if (!map.getSource('openmaptiles')) return;
    try {
      if (map.getLayer('fleet-village-houses')) map.removeLayer('fleet-village-houses');
      if (map.getSource('fleet-village-houses')) map.removeSource('fleet-village-houses');
      map.addSource('fleet-village-houses', { type: 'geojson', data: buildVillageHouses() });
      const layers = map.getStyle().layers || [];
      const firstLabelId = layers.find(
        (l: any) => l.type === 'symbol' && l.layout?.['text-field']
      )?.id;
      // Below real footprints (when present) so procedural clusters never
      // draw over genuinely mapped buildings.
      const beforeId =
        buildingLayerIdRef.current && map.getLayer(buildingLayerIdRef.current)
          ? buildingLayerIdRef.current
          : firstLabelId;
      map.addLayer(
        {
          id: 'fleet-village-houses',
          type: 'fill-extrusion',
          source: 'fleet-village-houses',
          minzoom: 14.2,
          paint: {
            'fill-extrusion-color': ['get', 'c'],
            'fill-extrusion-height': ['get', 'h'],
            'fill-extrusion-base': 0,
            'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 14.2, 0, 15.2, 0.9],
            'fill-extrusion-vertical-gradient': true,
          },
        } as any,
        beforeId
      );
    } catch {
      /* style swap in flight */
    }
  }, []);

  // Procedural tree canopy — one circle layer under the buildings; fades in
  // with the farm layers and is what makes the countryside read as Punjab.
  const addVegetationLayer = useCallback((map: maplibregl.Map) => {
    if (mapStyleRef.current === 'DARK_COCKPIT') return;
    if (!map.getSource('openmaptiles')) return;
    try {
      if (map.getLayer('fleet-vegetation')) map.removeLayer('fleet-vegetation');
      if (map.getSource('fleet-vegetation')) map.removeSource('fleet-vegetation');
      map.addSource('fleet-vegetation', { type: 'geojson', data: buildVegetation() });
      const layers = map.getStyle().layers || [];
      const firstLabelId = layers.find(
        (l: any) => l.type === 'symbol' && l.layout?.['text-field']
      )?.id;
      // Roads must render ABOVE trees. In OpenFreeMap bright the transportation
      // layers precede building-3d, so anchoring at building-3d would leave trees
      // above every road line. Anchor before the first transportation layer instead.
      const firstRoadLayer = layers.find(
        (l: any) =>
          l['source-layer'] === 'transportation' ||
          l['source-layer'] === 'transportation_name'
      )?.id;
      const beforeId = firstRoadLayer || buildingLayerIdRef.current || firstLabelId;
      map.addLayer(
        {
          id: 'fleet-vegetation',
          type: 'circle',
          source: 'fleet-vegetation',
          minzoom: 12.8,
          paint: {
            'circle-color': ['get', 'c'],
            // Per-tree canopy size (r metres) modulates the zoom ramp so groves
            // read as varied clumps instead of a uniform stipple field.
            // NOTE: data expr must sit INSIDE the stops — MapLibre silently
            // drops a top-level ['*', zoomInterp, dataExpr] product.
            'circle-radius': [
              'interpolate', ['linear'], ['zoom'],
              12.8, ['*', ['coalesce', ['get', 'r'], 5.5], 0.28],
              15, ['*', ['coalesce', ['get', 'r'], 5.5], 0.6],
              17, ['*', ['coalesce', ['get', 'r'], 5.5], 1.05],
              19, ['*', ['coalesce', ['get', 'r'], 5.5], 1.73],
            ],
            'circle-opacity': ['interpolate', ['linear'], ['zoom'], 12.8, 0, 13.6, 0.85],
            'circle-blur': 0.28,
            // Thin dark stroke simulates the shadow rim of a tree canopy,
            // matching the subtle edge-darkening visible in Google Earth.
            'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 13, 0, 15.5, 0.7],
            'circle-stroke-color': '#1e4f18',
            'circle-stroke-opacity': 0.55,
          },
        } as any,
        beforeId
      );
    } catch {
      /* style swap in flight */
    }
  }, []);

  // ── 3D BUILDING LAYER ────────────────────────────────────────────────────
  // One extrusion pass per style — injecting a second extrusion of the same
  // footprints double-drew buildings, made them z-fight, and covered roads.
  //   • Style ships its own extrusion (OpenFreeMap liberty → `building-3d`):
  //     adopt that layer and only drive its opacity / visibility.
  //   • Vector style without one (OpenFreeMap dark): inject a real-footprint
  //     extrusion below the label layers so street names/POIs stay readable.
  //   • Raster styles (Google tiles): no vector footprints → nothing to add.
  // We NEVER call map.moveLayer() — it breaks the style's layer ordering.
  // ─────────────────────────────────────────────────────────────────────────
  const applyBuildingMode = useCallback((map: maplibregl.Map, mode: BuildingViewMode) => {
    const id = buildingLayerIdRef.current;
    if (!id || !map.getLayer(id)) return;
    try {
      if (mode === 'OFF') {
        map.setLayoutProperty(id, 'visibility', 'none');
      } else {
        map.setLayoutProperty(id, 'visibility', 'visible');
        map.setPaintProperty(id, 'fill-extrusion-opacity', mode === 'GLASS' ? 0.18 : 0.88);
      }
    } catch {
      /* style swap in flight */
    }
  }, []);

  const adoptBuildingLayer = useCallback(
    (map: maplibregl.Map) => {
      try {
        const style = map.getStyle();
        if (!style?.layers?.length) return;

        const existing = style.layers.find((l: any) => l.type === 'fill-extrusion');
        if (existing) {
          buildingLayerIdRef.current = existing.id;
          // Apply our warm palette + Google Earth-style AO to the style's own
          // building layer (can't do this in the paint definition since the layer
          // already exists in the style). Wrapped separately so a single unsupported
          // property doesn't block the rest.
          try { map.setPaintProperty(existing.id, 'fill-extrusion-color', BUILDING_COLOR_VARIED); } catch { /* */ }
          try {
            map.setPaintProperty(existing.id, 'fill-extrusion-ambient-occlusion-intensity', 0.35);
            map.setPaintProperty(existing.id, 'fill-extrusion-ambient-occlusion-radius', 3.5);
          } catch { /* AO not supported on this runtime */ }
          try {
            map.setPaintProperty(existing.id, 'fill-extrusion-flood-light-intensity', 0.12);
            map.setPaintProperty(existing.id, 'fill-extrusion-flood-light-color', '#fffbef');
            map.setPaintProperty(existing.id, 'fill-extrusion-flood-light-ground-radius', 5);
          } catch { /* flood-light not supported on this runtime */ }
        } else if (map.getSource('openmaptiles')) {
          const firstLabelId = style.layers.find(
            (l: any) => l.type === 'symbol' && l.layout?.['text-field']
          )?.id;
          if (!map.getLayer('fleet-3d-buildings')) {
            map.addLayer(
              {
                id: 'fleet-3d-buildings',
                source: 'openmaptiles',
                'source-layer': 'building',
                type: 'fill-extrusion',
                minzoom: 14,
                filter: ['==', ['geometry-type'], 'Polygon'],
                paint: {
                  'fill-extrusion-color': BUILDING_COLOR_VARIED,
                  'fill-extrusion-height': [
                    'interpolate', ['linear'], ['zoom'],
                    14, 0,
                    14.5, ['coalesce', ['get', 'render_height'], ['get', 'height'], 8],
                  ],
                  'fill-extrusion-base': [
                    'interpolate', ['linear'], ['zoom'],
                    14, 0,
                    14.5, ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
                  ],
                  'fill-extrusion-vertical-gradient': true,
                },
              } as any,
              firstLabelId
            );
          }
          buildingLayerIdRef.current = 'fleet-3d-buildings';
        } else {
          buildingLayerIdRef.current = null;
        }

        applyBuildingMode(map, buildingModeRef.current);
        applySunLighting(map);
      } catch (err) {
        console.warn('3D building layer setup failed:', err);
      }
    },
    [applyBuildingMode, applySunLighting]
  );

  const toggle3DMode = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const next = !is3DMode;
    setIs3DMode(next);
    map.easeTo({ pitch: next ? PITCH_3D : PITCH_FLAT, duration: 600 });
  }, [is3DMode]);

  const centerCampus = useCallback(() => {
    mapRef.current?.flyTo({ center: DEFAULT_CENTER, zoom: 16.2, pitch: PITCH_3D, bearing: 28, duration: 1100 });
  }, []);

  const fitRouteCorridor = useCallback(() => {
    const map = mapRef.current;
    if (!map || !roadPath || roadPath.length < 2) {
      mapRef.current?.flyTo({ center: [76.82, 30.37], zoom: 11.5, pitch: 30, bearing: 0, duration: 1200 });
      return;
    }
    const lngs = roadPath.map((p) => p[0]);
    const lats = roadPath.map((p) => p[1]);
    map.fitBounds(
      [
        [Math.min(...lngs) - 0.01, Math.min(...lats) - 0.01],
        [Math.max(...lngs) + 0.01, Math.max(...lats) + 0.01],
      ],
      { pitch: 45, bearing: 12, padding: 60, duration: 1400, maxZoom: 15 }
    );
  }, [roadPath]);

  // Reset compass to true north (tap on the rose)
  const resetNorth = useCallback(() => {
    mapRef.current?.easeTo({ bearing: 0, pitch: is3DMode ? PITCH_3D : PITCH_FLAT, duration: 600 });
  }, [is3DMode]);

  const handleStyleChange = useCallback(
    (newStyle: MapStyleType) => {
      const map = mapRef.current;
      if (!map) return;
      setMapStyle(newStyle);
      mapStyleRef.current = newStyle;
      // diff: false forces a full style rebuild so `style.load` fires and
      // rebuildOverlays re-adds the route/geofence/trail layers (diff-based
      // setStyle silently drops them and never emits `style.load`).
      map.setStyle(getStyleConfig(newStyle), { diff: false });
    },
    [getStyleConfig]
  );

  // 1. Init map (pitch 60, bearing sync ready, flyTo/easeTo transitions)
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: getStyleConfig('GOOGLE_3D'),
      center: DEFAULT_CENTER,
      zoom: 16.1,
      pitch: PITCH_3D,
      bearing: 28,
      antialias: true,
      maxPitch: 70,
      fadeDuration: 120,
    });

    mapRef.current = map;
    // bright sprite bundle lacks a few icons (swimming_pool, gate) -> feed a
    // transparent 1x1 so MapLibre never logs "image could not be loaded" errors
    map.on('styleimagemissing', (e) => {
      if (map.hasImage(e.id)) return;
      try {
        map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) }, { pixelRatio: 1 });
      } catch {
        /* style swap in flight */
      }
    });
    // Alias refs for the unmount cleanup below (avoids direct .current reads in cleanup)
    const lerpBox = lerpEngineRef;
    const puckBox = busMarkerRef;
    const radarBox = multiBusMarkersRef;
    const stopsBox = stopMarkersRef;
    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 90 }), 'bottom-left');

    let ready = false;

    const onStyleReady = () => {
      if (ready) return;
      ready = true;
      setMapLoaded(true);

      adoptBuildingLayer(map);
      addTerrainLayer(map);
      addVillageHouseLayer(map);
      addVegetationLayer(map);
      applySky(map, mapStyleRef.current);
      rebuildOverlays(map);
      // Cinematic settle onto MMU Mullana campus
      map.easeTo({ center: DEFAULT_CENTER, zoom: 16.1, pitch: PITCH_3D, bearing: 28, duration: 900 });
    };

    map.on('load', onStyleReady);
    map.on('style.load', () => {
      if (!ready) return;
      adoptBuildingLayer(map);
      addTerrainLayer(map);
      addVillageHouseLayer(map);
      addVegetationLayer(map);
      applySky(map, mapStyleRef.current);
      rebuildOverlays(map);
    });
    map.on('rotate', () => {
      const b = map.getBearing();
      setMapBearing(Math.round(b));
      // Keep the bus heading cone screen-accurate while the camera turns
      const heading = busHeadingRef.current;
      if (heading) {
        heading.style.transform = `rotate(${(lastBusBearingRef.current - b + 360) % 360}deg)`;
      }
    });
    // Manual pan = free camera (standard maps UX); the Follow button re-engages
    map.on('dragstart', () => setIsFollowingBus(false));

    // Marching-dash animation loop (cheap: only touches one paint property)
    let dashFrame = 0;
    let lastStep = 0;
    const dashLoop = (ts: number) => {
      dashRafRef.current = requestAnimationFrame(dashLoop);
      if (ts - lastStep < FLOW_STEP_MS) return;
      lastStep = ts;
      if (!map.getLayer('route-flow')) return;
      dashFrame = (dashFrame + 1) % DASH_MARCH_SEQUENCE.length;
      try {
        map.setPaintProperty('route-flow', 'line-dasharray', DASH_MARCH_SEQUENCE[dashFrame]);
      } catch {
        /* style swap in flight */
      }
    };
    dashRafRef.current = requestAnimationFrame(dashLoop);

    return () => {
      if (dashRafRef.current !== null) {
        cancelAnimationFrame(dashRafRef.current);
        dashRafRef.current = null;
      }
      lerpBox.current?.destroy();
      lerpBox.current = null;
      puckBox.current?.remove();
      puckBox.current = null;
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      radarBox.current.forEach((m) => m.remove());
      radarBox.current.clear();
      stopsBox.current.forEach((m) => m.remove());
      stopsBox.current = [];
      map.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fullscreen sync (Android WebView may not support the API — guarded)
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        el.requestFullscreen?.().catch(() => undefined);
      } else {
        document.exitFullscreen?.().catch(() => undefined);
      }
    } catch {
      /* unsupported (e.g. some webviews) */
    }
  }, []);

  // 2. Road route polyline — street-snapped, rounded joins & caps
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    roadPathRef.current = roadPath;
    routeColorRef.current = activeRoute?.colorHex || '#3B82F6';
    addRouteLayers(map, roadPath || [], routeColorRef.current);
    syncAvenueTrees(map, roadPath || []);
  }, [roadPath, mapLoaded, activeRoute, addRouteLayers, syncAvenueTrees]);

  // 2b. Trail lifecycle — reset breadcrumbs whenever the corridor changes
  useEffect(() => {
    trailRef.current = { routeId: activeRoute?.id, coords: [], lastPush: 0 };
    const map = mapRef.current;
    if (map && mapLoaded && map.getSource('bus-trail-path')) {
      (map.getSource('bus-trail-path') as maplibregl.GeoJSONSource).setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [] },
        properties: {},
      } as any);
    }
  }, [activeRoute?.id, mapLoaded]);

  // 2c. Geofence rings around the selected / student stop
  useEffect(() => {
    selectedStopRef.current = selectedStop || null;
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    addGeofenceLayers(map, selectedStop || null);
  }, [selectedStop, mapLoaded, addGeofenceLayers]);

  // Journey progress snapshot for the HUD (derived from live telemetry only)
  const journey = useMemo(() => {
    if (!activeRoute || !activeBus) return null;
    const total = activeRoute.stops.length;
    if (!total) return null;
    const idx = activeRoute.stops.findIndex((s) => s.name === activeBus.upcomingStopName);
    if (idx === -1) return null;
    return {
      total,
      nextIdx: idx,
      passed: idx,
      remaining: total - idx,
      pct: total > 1 ? (idx / (total - 1)) * 100 : 0,
      nextStop: activeRoute.stops[idx],
    };
  }, [activeRoute, activeBus]);

  // 3. Metro-style stop markers with passed / next / upcoming status
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    stopMarkersRef.current.forEach((m) => m.remove());
    stopMarkersRef.current = [];

    if (!activeRoute?.stops) return;

    const nextIdx = journey?.nextIdx ?? -1;

    activeRoute.stops.forEach((stop, i) => {
      const isSelected = selectedStop?.id === stop.id;
      const isPassed = nextIdx !== -1 && i < nextIdx;
      const isNext = i === nextIdx;

      const badgeCls = isSelected
        ? 'bg-gradient-to-br from-red-500 to-rose-700 border-white text-white shadow-[0_0_14px_rgba(239,68,68,0.8)]'
        : isPassed
        ? 'bg-emerald-600 border-emerald-300 text-white'
        : isNext
        ? 'bg-gradient-to-br from-amber-400 to-orange-500 border-amber-100 text-slate-950 shadow-[0_0_14px_rgba(245,158,11,0.8)]'
        : i === 0
        ? 'bg-slate-900 border-emerald-400 text-emerald-300'
        : i === activeRoute.stops.length - 1
        ? 'bg-slate-900 border-red-400 text-red-300'
        : 'bg-slate-900 border-slate-500 text-slate-100';

      const labelCls = isSelected
        ? 'bg-red-950/95 border-red-400/70 text-red-100'
        : isNext
        ? 'bg-amber-500 text-slate-950 border-amber-200'
        : isPassed
        ? 'bg-slate-950/85 border-slate-700 text-slate-500'
        : 'bg-slate-950/90 border-white/15 text-slate-200';

      const el = document.createElement('div');
      el.className = 'select-none cursor-pointer';
      el.innerHTML = `
        <div class="relative flex flex-col items-center group" title="${i + 1}. ${stop.name} — ${stop.landmark}">
          <div class="px-1.5 py-0.5 mb-0.5 rounded-md text-[9px] font-bold whitespace-nowrap border shadow-lg ${labelCls}"
               style="max-width:104px;overflow:hidden;text-overflow:ellipsis;">
            ${i + 1}. ${stop.name}
          </div>
          <div class="relative">
            ${isNext || isSelected ? '<span class="absolute -inset-1.5 rounded-full animate-ping opacity-40" style="background:' + (isSelected ? '#ef4444' : '#f59e0b') + ';"></span>' : ''}
            <div class="relative w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center text-[10px] font-black ${badgeCls}">
              ${isPassed ? '<svg viewBox="0 0 24 24" class="w-3 h-3 stroke-white" fill="none" stroke-width="3.5"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>' : i + 1}
            </div>
          </div>
        </div>
      `;
      el.addEventListener('click', () => onSelectStop?.(stop));
      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, 4] })
        .setLngLat([stop.longitude, stop.latitude])
        .addTo(map);
      stopMarkersRef.current.push(marker);
    });
  }, [activeRoute, selectedStop, mapLoaded, onSelectStop, journey?.nextIdx]);

  // 4. Multi-bus fleet radar markers (Admin view)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const existing = multiBusMarkersRef.current;
    const seen = new Set<string>();

    allBuses.forEach((bus) => {
      if (!bus.latitude || !bus.longitude) return;
      seen.add(bus.busId);
      const health =
        Date.now() - new Date(bus.lastPing).getTime() < 30_000
          ? 'LIVE'
          : Date.now() - new Date(bus.lastPing).getTime() < 120_000
          ? 'STALE'
          : 'PARKED';
      const ringColor =
        health === 'LIVE' ? '#10b981' : health === 'STALE' ? '#f59e0b' : '#6b7280';
      const overspeed = bus.speedKmh > 75;

      if (existing.has(bus.busId)) {
        existing.get(bus.busId)!.setLngLat([bus.longitude, bus.latitude]);
      } else {
        const el = document.createElement('div');
        el.className = 'select-none cursor-pointer';
        el.innerHTML = `
          <div class="relative flex flex-col items-center" title="${bus.busNumber} | ${bus.routeName || 'Route'} | ${bus.speedKmh.toFixed(0)} km/h">
            <div class="absolute inset-0 rounded-full animate-ping opacity-40" style="background:${ringColor};width:2.5rem;height:2.5rem;top:-0.25rem;left:-0.25rem;"></div>
            <div class="relative flex flex-col items-center justify-center w-9 h-9 rounded-full shadow-2xl border-2" style="background:linear-gradient(135deg,#1e293b,#0f172a);border-color:${ringColor};">
              <span class="text-[8px] font-black text-white leading-none">${bus.busNumber}</span>
              <span class="text-[6px] font-bold leading-none mt-0.5" style="color:${overspeed ? '#ef4444' : '#f59e0b'}">${bus.speedKmh.toFixed(0)}</span>
            </div>
          </div>
        `;
        el.addEventListener('click', () => onSelectBus?.(bus));
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([bus.longitude, bus.latitude])
          .addTo(map);
        existing.set(bus.busId, marker);
      }
    });

    // Remove stale markers
    existing.forEach((m, id) => {
      if (!seen.has(id)) {
        m.remove();
        existing.delete(id);
      }
    });
  }, [allBuses, mapLoaded, onSelectBus]);

  // 5. Single active bus puck (VehicleLerpEngine smooth lerp + heading cone + trail)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (!activeBus) {
      if (busMarkerRef.current) {
        busMarkerRef.current.remove();
        busMarkerRef.current = null;
      }
      if (lerpEngineRef.current) {
        lerpEngineRef.current.destroy();
        lerpEngineRef.current = null;
      }
      busLivenessRef.current = false;
      return;
    }

    const { latitude, longitude, bearing = 0, speedKmh = 0 } = activeBus;
    if (!latitude || !longitude) return;

    const live = isBusLive(activeBus);
    setCurrentSpeed(live ? speedKmh || 0 : 0);

    // Liveness flips (parked ↔ moving) require a marker rebuild so the
    // pulse ring + heading cone reflect the true telemetry state
    if (busMarkerRef.current && busLivenessRef.current !== live) {
      busMarkerRef.current.remove();
      busMarkerRef.current = null;
      lerpEngineRef.current?.destroy();
      lerpEngineRef.current = null;
      busElRef.current = null;
      busHeadingRef.current = null;
    }
    busLivenessRef.current = live;
    lastBusBearingRef.current = bearing || 0;

    if (!busMarkerRef.current) {
      const el = document.createElement('div');
      busElRef.current = el;
      el.className = 'select-none pointer-events-none';
      el.innerHTML = `
        <div class="relative flex flex-col items-center" id="bus-puck-root">
          ${live ? '<div class="absolute inset-0 rounded-full animate-ping opacity-30" style="background:#ef4444;width:3.5rem;height:3.5rem;top:-0.75rem;left:-0.75rem;animation-duration:1.4s;"></div>' : ''}
          <div id="bus-heading-rotor" class="relative flex items-center justify-center" style="will-change:transform;">
            ${
              live
                ? '<div style="position:absolute;top:-15px;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:9px solid rgba(248,113,113,0.95);filter:drop-shadow(0 0 4px rgba(239,68,68,0.8));"></div>'
                : ''
            }
            <div class="relative flex items-center justify-center w-10 h-10 rounded-full shadow-2xl" style="background:${live ? 'linear-gradient(135deg,#dc2626,#991b1b)' : 'linear-gradient(135deg,#475569,#334155)'};border:2.5px solid ${live ? '#fca5a5' : '#94a3b8'};">
              <svg viewBox="0 0 24 24" class="w-5 h-5 fill-white"><path d="M17 20H7v1a1 1 0 01-1 1H5a1 1 0 01-1-1v-1a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v12a2 2 0 01-2 2zm-2-5a1 1 0 100 2 1 1 0 000-2zm-6 0a1 1 0 100 2 1 1 0 000-2zM4 13h16V8H4v5z"/></svg>
            </div>
          </div>
          <div class="mt-1 px-2 py-0.5 rounded-full text-[9px] font-black text-white shadow-xl" style="background:rgba(15,23,42,0.92);border:1px solid rgba(255,255,255,0.15);white-space:nowrap;">
            ${activeBus.busNumber || 'BUS-01'} ${live ? '' : '• PARKED'}
          </div>
        </div>
      `;
      busHeadingRef.current = el.querySelector('#bus-heading-rotor') as HTMLDivElement | null;
      const mapBearingNow = map.getBearing();
      if (busHeadingRef.current) {
        busHeadingRef.current.style.transform = `rotate(${((bearing || 0) - mapBearingNow + 360) % 360}deg)`;
      }
      busMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([longitude, latitude])
        .addTo(map);

      lerpEngineRef.current = new VehicleLerpEngine(
        [longitude, latitude],
        bearing || 0,
        (coords, b) => {
          busMarkerRef.current?.setLngLat(coords);
          setCurrentBearing(Math.round(b));
          lastBusBearingRef.current = b;
          const heading = busHeadingRef.current;
          if (heading) {
            const mb = mapRef.current?.getBearing() ?? 0;
            heading.style.transform = `rotate(${(b - mb + 360) % 360}deg)`;
          }
        },
        1200
      );
    } else {
      lerpEngineRef.current?.updateTarget([longitude, latitude], bearing || 0, 1200);
    }

    // Breadcrumb trail — authentic positions only, throttled to meaningful moves
    if (live && activeBus) {
      const trail = trailRef.current;
      if (trail.routeId !== activeBus.routeId) {
        trail.routeId = activeBus.routeId;
        trail.coords = [];
      }
      const now = Date.now();
      const last = trail.coords[trail.coords.length - 1];
      const movedMeters = last
        ? Math.hypot((longitude - last[0]) * 96150, (latitude - last[1]) * 111200)
        : Infinity;
      if ((!last || (now - trail.lastPush > 4000 && movedMeters > 15)) && trail.coords.length < 240) {
        trail.coords.push([longitude, latitude]);
        trail.lastPush = now;
        updateTrailSource(map, trail.coords);
      }
    }

    if (isFollowingBus && live) {
      map.easeTo({ center: [longitude, latitude], bearing: bearing ?? 0, duration: 800, easing: (t) => t });
    }
  }, [activeBus, mapLoaded, isFollowingBus, updateTrailSource]);

  const compassLabel = (b: number) => {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(((b % 360) + 360) % 360 / 45) % 8];
  };

  const isLive = isBusLive(activeBus);
  const hudBearing = activeBus ? currentBearing : mapBearing;

  return (
    <div ref={wrapRef} className="relative w-full h-full overflow-hidden bg-slate-950">
      {/* Map Canvas */}
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" />

      {/* Cinematic edge vignette — pure CSS, zero GPU layer cost */}
      <div
        className="absolute inset-0 pointer-events-none z-[5]"
        style={{ boxShadow: 'inset 0 0 140px rgba(2,6,23,0.5)' }}
      />

      {/* 1. Geo Notice Banner — only when real device GPS available */}
      {geoNotice && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 max-w-sm w-full px-3 pointer-events-auto">
          <div className="flex items-start gap-2.5 bg-amber-950/90 backdrop-blur-xl border border-amber-600/40 rounded-2xl p-3 shadow-2xl">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-200 leading-relaxed flex-1">{geoNotice.message}</p>
            <button onClick={() => setGeoNotice(null)} className="text-amber-400 hover:text-amber-200 flex-shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 2. Live Bus Status HUD — top left floating card (desktop only; mobile bottom sheet covers this) */}
      {activeBus && (
        <div className={`hidden md:block absolute ${isCockpitMode ? 'top-3 left-3' : 'top-3 left-3'} z-20 pointer-events-auto`}>
          <div className="bg-slate-950/90 backdrop-blur-2xl border border-white/10 rounded-2xl px-3.5 py-2.5 shadow-2xl flex items-center gap-2.5 max-w-[240px]">
            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isLive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <div className="min-w-0">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider truncate">
                {activeBus.busNumber} • {activeBus.routeName || 'Route'}
              </div>
              <div className="text-xs font-black text-white truncate">{activeBus.upcomingStopName || 'En Route'}</div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className={`text-base font-black font-mono ${activeBus.speedKmh > 75 ? 'text-red-400' : 'text-amber-400'}`}>
                {activeBus.speedKmh.toFixed(0)}
              </div>
              <div className="text-[8px] text-slate-500 font-bold">KM/H</div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Map Controls — top right */}
      <div className="absolute top-16 md:top-4 right-2 sm:right-4 z-20 flex flex-col items-end gap-2 pointer-events-auto">

        {/* ── Mobile compact toolbar ── */}
        <div className="flex md:hidden items-center bg-slate-950/90 backdrop-blur-xl p-1 rounded-2xl border border-white/10 shadow-2xl gap-1">
          {/* Map style cycle — 3D → Satellite → Roadmap */}
          <button
            onClick={() => {
              const cycle: MapStyleType[] = ['GOOGLE_3D', 'GOOGLE_SATELLITE', 'GOOGLE_ROADMAP'];
              const idx = cycle.indexOf(mapStyle);
              const next = cycle[(idx + 1) % cycle.length];
              handleStyleChange(next);
            }}
            className={`p-1.5 rounded-xl text-[10px] font-black flex items-center gap-1 transition-all ${
              mapStyle === 'GOOGLE_3D'
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg'
                : mapStyle === 'GOOGLE_SATELLITE'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg'
                : 'bg-blue-700 text-white'
            }`}
            title="Cycle Map Style"
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>
              {mapStyle === 'GOOGLE_3D' ? '3D' : mapStyle === 'GOOGLE_SATELLITE' ? 'SAT' : 'MAP'}
            </span>
          </button>
          <button
            onClick={() => {
              const next = buildingMode === 'GLASS' ? 'SOLID' : buildingMode === 'SOLID' ? 'OFF' : 'GLASS';
              handleBuildingModeChange(next);
            }}
            className={`p-1.5 rounded-xl text-[10px] font-black flex items-center gap-1 transition-all ${
              buildingMode === 'SOLID' ? 'bg-amber-500/90 text-white' : buildingMode === 'GLASS' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400'
            }`}
            title="Buildings: Solid / Glass / Off"
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>{buildingMode === 'SOLID' ? 'S3D' : buildingMode === 'GLASS' ? 'GLS' : 'OFF'}</span>
          </button>
          <button
            onClick={toggle3DMode}
            className={`p-1.5 rounded-xl text-[10px] font-black transition-all ${is3DMode ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400'}`}
            title="60° Tilt"
          >
            <Layers className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => checkUserLocation(true)}
            className="p-1.5 rounded-xl bg-cyan-600/80 text-white hover:bg-cyan-500 transition-all"
            title="Locate Me"
          >
            <LocateFixed className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={fitRouteCorridor}
            className="p-1.5 rounded-xl bg-amber-600/80 text-white hover:bg-amber-500 transition-all"
            title="Fit Route"
          >
            <Milestone className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsFollowingBus(!isFollowingBus)}
            className={`p-1.5 rounded-xl font-black transition-all ${isFollowingBus ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-400'}`}
            title="Follow Bus"
          >
            <Navigation className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={centerCampus}
            className="p-1.5 rounded-xl bg-slate-800/90 text-red-400 hover:bg-slate-700 transition-all"
            title="MMU Campus"
          >
            <MapPin className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={toggleFullscreen}
            className={`p-1.5 rounded-xl transition-all ${isFullscreen ? 'bg-slate-200 text-slate-900' : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700'}`}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* ── Desktop Map Style Pill Selector ── */}
        <div className="hidden md:flex items-center bg-slate-950/88 backdrop-blur-2xl p-1 rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] gap-0.5">
          {/* 3D Vector — PRIMARY / DEFAULT */}
          <button
            onClick={() => handleStyleChange('GOOGLE_3D')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition-all ${
              mapStyle === 'GOOGLE_3D'
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-[0_0_16px_rgba(245,158,11,0.5)]'
                : 'text-slate-400 hover:text-amber-300 hover:bg-white/5'
            }`}
            title="3D Vector Map — richest detail with buildings, roads, POIs"
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>3D Vector</span>
            {mapStyle === 'GOOGLE_3D' && <span className="text-[9px] bg-white/20 px-1 rounded font-bold ml-0.5">LIVE</span>}
          </button>

          {/* Satellite */}
          <button
            onClick={() => handleStyleChange('GOOGLE_SATELLITE')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition-all ${
              mapStyle === 'GOOGLE_SATELLITE'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-[0_0_16px_rgba(16,185,129,0.4)]'
                : 'text-slate-400 hover:text-emerald-300 hover:bg-white/5'
            }`}
            title="Google Satellite + Hybrid Labels"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Satellite</span>
          </button>

          {/* Divider */}
          <div className="w-px h-5 bg-white/10 mx-1" />

          {/* Roadmap (tucked at end) */}
          <button
            onClick={() => handleStyleChange('GOOGLE_ROADMAP')}
            className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-bold transition-all ${
              mapStyle === 'GOOGLE_ROADMAP'
                ? 'bg-blue-600 text-white'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
            }`}
            title="Classic Google Roadmap"
          >
            <MapIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* ── Desktop Action Controls Row ── */}
        <div className="hidden md:flex items-center justify-end gap-1.5">
          <button
            onClick={() => {
              const next = buildingMode === 'GLASS' ? 'SOLID' : buildingMode === 'SOLID' ? 'OFF' : 'GLASS';
              handleBuildingModeChange(next);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-lg backdrop-blur-md border ${
              buildingMode === 'SOLID'
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-amber-400/60 shadow-amber-900/30'
                : buildingMode === 'GLASS'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white border-cyan-400/60'
                : 'bg-slate-900/90 text-slate-400 border-slate-700/60 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title="3D Building Visibility: Solid → Glass → Off"
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>{buildingMode === 'SOLID' ? 'Solid 3D' : buildingMode === 'GLASS' ? 'Glass 3D' : 'Bldgs Off'}</span>
          </button>

          <button
            onClick={toggle3DMode}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-lg backdrop-blur-md border ${
              is3DMode
                ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white border-red-500/60 shadow-red-900/30'
                : 'bg-slate-900/90 text-slate-400 border-slate-700/60 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{is3DMode ? '60° Tilt' : 'Flat 2D'}</span>
          </button>

          <button
            onClick={() => checkUserLocation(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-700 to-sky-700 text-white border border-cyan-500/40 shadow-lg shadow-cyan-900/30 hover:from-cyan-600 hover:to-sky-600 transition-all backdrop-blur-md"
            title="Locate My GPS Position"
          >
            <LocateFixed className="w-3.5 h-3.5" />
            <span>Locate Me</span>
          </button>

          <button
            onClick={fitRouteCorridor}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-600 to-yellow-600 text-white border border-amber-400/40 shadow-lg shadow-amber-900/30 hover:from-amber-500 hover:to-yellow-500 transition-all backdrop-blur-md"
            title="Fit Full Ambala – MMU Route"
          >
            <Milestone className="w-3.5 h-3.5" />
            <span>Fit Route</span>
          </button>

          <button
            onClick={() => setIsFollowingBus(!isFollowingBus)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all shadow-lg backdrop-blur-md border ${
              isFollowingBus
                ? 'bg-gradient-to-r from-amber-400 to-yellow-400 text-slate-950 border-amber-300/60 shadow-amber-900/30'
                : 'bg-slate-900/90 text-slate-400 border-slate-700/60 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>{isFollowingBus ? 'Tracking' : 'Free Cam'}</span>
          </button>

          <button
            onClick={centerCampus}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-red-700 to-rose-700 text-white border border-red-500/40 shadow-lg shadow-red-900/30 hover:from-red-600 hover:to-rose-600 transition-all backdrop-blur-md"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>MMU Campus</span>
          </button>

          <button
            onClick={toggleFullscreen}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-lg backdrop-blur-md border ${
              isFullscreen
                ? 'bg-slate-200 text-slate-900 border-white'
                : 'bg-slate-900/90 text-slate-300 border-slate-700/60 hover:text-white hover:bg-slate-800'
            }`}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
            <span>{isFullscreen ? 'Exit Full' : 'Fullscreen'}</span>
          </button>
        </div>
      </div>

      {/* 4. High-Precision Real-Time Speedometer & Telemetry Cockpit HUD */}
      <div className="absolute bottom-[11.5rem] md:bottom-5 left-3 md:left-5 z-20 flex flex-col items-start gap-2 pointer-events-auto select-none">
        <div className="flex items-center gap-3 md:gap-3.5 bg-slate-950/85 backdrop-blur-2xl p-2.5 md:p-3 rounded-2xl md:rounded-3xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
          {/* Radial Circular Speedometer Gauge */}
          <div className="relative w-14 h-14 md:w-16 md:h-16 flex items-center justify-center flex-shrink-0">
            <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 80 80">
              {/* Background Arc */}
              <circle
                cx="40"
                cy="40"
                r="33"
                stroke="currentColor"
                strokeWidth="6"
                className="text-slate-800"
                fill="transparent"
                strokeDasharray="207.3"
                strokeDashoffset="51.8"
                strokeLinecap="round"
              />
              {/* Animated Progress Arc */}
              <circle
                cx="40"
                cy="40"
                r="33"
                stroke={currentSpeed > 75 ? '#ef4444' : currentSpeed > 50 ? '#f59e0b' : '#10b981'}
                strokeWidth="6"
                fill="transparent"
                strokeLinecap="round"
                strokeDasharray="207.3"
                strokeDashoffset={207.3 - Math.min((currentSpeed / 100) * 155.5, 155.5) - 51.8}
                style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-sm md:text-base font-black font-mono leading-none ${currentSpeed > 75 ? 'text-red-400' : 'text-white'}`}>
                {Math.round(currentSpeed)}
              </span>
              <span className="text-[8px] text-slate-500 font-bold">KM/H</span>
            </div>
          </div>

          {/* Telemetry Info Stack */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isLive ? 'bg-emerald-400 animate-pulse' : activeBus ? 'bg-amber-400' : 'bg-slate-600'}`} />
              <span className="text-[10px] font-black text-slate-300 uppercase tracking-wide">
                {isLive ? 'EN ROUTE' : activeBus ? 'PARKED' : 'STANDBY'}
              </span>
            </div>
            <div className="text-xs font-black text-white">
              {compassLabel(hudBearing)} <span className="text-slate-400 font-mono text-[10px]">{hudBearing}°</span>
            </div>
            <div className="text-[10px] font-bold text-slate-400">
              {activeBus ? `${activeBus.boardedCount}/${activeBus.capacity} pax` : 'No Bus Active'}
            </div>
          </div>
        </div>

        {/* Journey Progress Strip — live corridor advancement */}
        {journey && (
          <div className="w-[220px] md:w-[280px] bg-slate-950/85 backdrop-blur-2xl px-3 py-2.5 rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Flag className="w-3 h-3 text-amber-400" /> Next Stop
              </span>
              <span className="text-[9px] font-mono font-bold text-slate-300 bg-white/10 px-1.5 py-0.5 rounded-full border border-white/10">
                {journey.passed + 1}/{journey.total}
              </span>
            </div>
            <div className="text-[11px] font-black text-white truncate">{journey.nextStop.name}</div>
            <div className="relative h-1.5 w-full rounded-full bg-slate-800 overflow-hidden mt-1.5">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-700"
                style={{ width: `${journey.pct}%` }}
              />
              <div className="absolute inset-0 progress-stripes" />
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[9px] text-slate-500 font-bold">{journey.remaining} stops remaining</span>
              {isLive && activeBus && activeBus.etaMinutesUpcomingStop > 0 && (
                <span className="text-[9px] font-black text-amber-400">~{Math.round(activeBus.etaMinutesUpcomingStop)} min</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 5. Selected stop info popup */}
      {selectedStop && (
        <div className="absolute bottom-40 md:bottom-5 right-3 md:right-24 z-20 pointer-events-auto">
          <div className="bg-slate-950/90 backdrop-blur-2xl border border-white/10 rounded-2xl p-3 shadow-2xl max-w-[200px]">
            <p className="text-[10px] font-black text-amber-400 uppercase tracking-wider">Stop #{selectedStop.stopSequence}</p>
            <p className="text-sm font-black text-white leading-tight mt-0.5">{selectedStop.name}</p>
            <p className="text-[10px] text-slate-400 mt-1">{selectedStop.landmark}</p>
            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
              <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded-full border border-emerald-900">
                {selectedStop.geofenceRadiusMeters}m radius
              </span>
              <span className="text-[9px] font-bold text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded-full border border-amber-900">
                1 km alert ring
              </span>
              {selectedStop.isMajorHub && (
                <span className="text-[9px] font-bold text-cyan-300 bg-cyan-950/60 px-1.5 py-0.5 rounded-full border border-cyan-900">
                  Major Hub
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. North Compass Rose — tap to reset north */}
      <div className="absolute bottom-[11.5rem] md:bottom-5 right-3 md:right-5 z-10 pointer-events-auto select-none">
        <button
          onClick={resetNorth}
          className="w-9 h-9 rounded-full bg-slate-950/80 backdrop-blur-xl border border-white/10 flex items-center justify-center shadow-xl hover:border-white/30 transition-colors cursor-pointer"
          style={{ transform: `rotate(${-mapBearing}deg)`, transition: 'transform 0.5s ease, border-color 0.2s ease' }}
          title="Reset North"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5">
            <path d="M12 2L8 10h8L12 2z" fill="#ef4444" />
            <path d="M12 22L8 14h8L12 22z" fill="#94a3b8" />
          </svg>
        </button>
      </div>
    </div>
  );
};
