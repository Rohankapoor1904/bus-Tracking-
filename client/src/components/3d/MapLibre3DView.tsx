import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Route, RouteStop, LiveBusState } from '../../types/index.js';
import { VehicleLerpEngine } from './VehicleLerpEngine.js';
import { api } from '../../services/api.js';
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

// Preserve ground-truth architectural building scale with clean boundary rendering
const fitMmuBuildings = (fc: any): any => {
  if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) return fc;
  return fc;
};

function isBusLive(bus?: LiveBusState | null): boolean {
  if (!bus) return false;
  return bus.status !== 'IDLE' && (bus.speedKmh || 0) > 0.5;
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
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const busMarkerRef = useRef<maplibregl.Marker | null>(null);
  const busElRef = useRef<HTMLDivElement | null>(null);
  const multiBusMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const stopMarkersRef = useRef<maplibregl.Marker[]>([]);
  const lerpEngineRef = useRef<VehicleLerpEngine | null>(null);
  const buildingDataRef = useRef<any>(null);

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
  const [mapLoaded, setMapLoaded] = useState<boolean>(false);
  const [currentSpeed, setCurrentSpeed] = useState<number>(0);
  const [currentBearing, setCurrentBearing] = useState<number>(0);
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
    const map = mapRef.current;
    if (!map) return;
    const osmOpacity = next === 'GLASS' ? 0.18 : next === 'SOLID' ? 0.80 : 0;
    const mmuOpacity = next === 'GLASS' ? 0.22 : next === 'SOLID' ? 0.85 : 0;
    if (map.getLayer('3d-buildings-osm')) {
      map.setPaintProperty('3d-buildings-osm', 'fill-extrusion-opacity', osmOpacity);
    }
    if (map.getLayer('mmu-3d-buildings')) {
      map.setPaintProperty('mmu-3d-buildings', 'fill-extrusion-opacity', mmuOpacity);
    }
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
    if (style === 'GOOGLE_3D') return 'https://tiles.openfreemap.org/styles/liberty';
    if (style === 'DARK_COCKPIT') return 'https://tiles.openfreemap.org/styles/dark';
    return GOOGLE_ROADMAP_SPEC;
  }, []);

  // Prefetch campus building GeoJSON once
  useEffect(() => {
    api
      .getCampusBuildingsGeoJson()
      .then((data) => {
        buildingDataRef.current = data?.type === 'FeatureCollection' ? data : data?.data || data;
      })
      .catch(() => undefined);
  }, []);

  const applySunLighting = useCallback((map: maplibregl.Map) => {
    // Ambient + directional sun tuned for Ambala latitude (~30.25N).
    // Rich cast shadows across 3D solid structures
    try {
      map.setLight({
        anchor: 'viewport',
        color: '#FFF8EB',
        intensity: 0.85,
        position: [1.35, 195, 42],
      });
    } catch {
      /* older style without light support */
    }
  }, []);

  // ── BUILDING EXTRUSION INJECTION ─────────────────────────────────────────
  // Strategy: find the right insertion point BELOW road lines so buildings
  // are rendered beneath road networks and labels.
  //
  // IMPORTANT: We NEVER call map.moveLayer() — it destroys the Liberty style's
  // carefully crafted layer ordering and causes a blank/broken map.
  //
  // Insertion priority:
  //   1. Liberty's own 'building' fill layer (if exists) — insert just before it
  //   2. First transportation/road `line` layer
  //   3. Any `line` layer
  //   4. First text `symbol` layer (for raster tile styles)
  // ─────────────────────────────────────────────────────────────────────────
  const injectBuildingExtrusions = useCallback(
    (map: maplibregl.Map, geoJson: any) => {
      try {
        const style = map.getStyle();
        if (!style?.layers?.length) return;

        // Find the best insertion point
        const libertyBuildingLayerId = style.layers.find(
          (l: any) => l.id === 'building' || l.id?.startsWith('building-')
        )?.id;

        const firstRoadLineId = style.layers.find(
          (l: any) =>
            l.type === 'line' &&
            (l['source-layer'] === 'transportation' ||
              l['source-layer'] === 'road' ||
              (l.id && (l.id.includes('road') || l.id.includes('tunnel') || l.id.includes('highway'))))
        )?.id;

        const anyLineId = style.layers.find((l: any) => l.type === 'line')?.id;

        const firstSymbolId = style.layers.find(
          (l: any) => l.type === 'symbol' && l.layout?.['text-field']
        )?.id;

        // insertBefore = undefined means append to top (only as last resort)
        const insertBefore: string | undefined =
          libertyBuildingLayerId || firstRoadLineId || anyLineId || firstSymbolId;

        const osmOpacity = buildingMode === 'GLASS' ? 0.18 : buildingMode === 'SOLID' ? 0.80 : 0;
        const mmuOpacity = buildingMode === 'GLASS' ? 0.22 : buildingMode === 'SOLID' ? 0.85 : 0;

        // 1. OSM vector-tile buildings — neutral cool-gray palette
        if (map.getSource('openmaptiles') && !map.getLayer('3d-buildings-osm')) {
          map.addLayer(
            {
              id: '3d-buildings-osm',
              source: 'openmaptiles',
              'source-layer': 'building',
              type: 'fill-extrusion',
              minzoom: 14,
              filter: ['==', ['geometry-type'], 'Polygon'],
              paint: {
                'fill-extrusion-color': [
                  'interpolate', ['linear'],
                  ['coalesce', ['get', 'render_height'], ['get', 'height'], 6],
                  0,  '#dde3ea',
                  10, '#c4cdd8',
                  25, '#9aaabb',
                  50, '#7a8fa3',
                ],
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
                'fill-extrusion-opacity': osmOpacity,
                'fill-extrusion-vertical-gradient': true,
              },
            } as any,
            insertBefore
          );
        }

        // 2. MMU campus custom GeoJSON buildings — neutral height-based palette
        if (geoJson) {
          const fitted = fitMmuBuildings(geoJson);
          if (map.getSource('mmu-buildings-source')) {
            (map.getSource('mmu-buildings-source') as maplibregl.GeoJSONSource).setData(fitted);
          } else {
            map.addSource('mmu-buildings-source', { type: 'geojson', data: fitted });
            map.addLayer(
              {
                id: 'mmu-3d-buildings',
                type: 'fill-extrusion',
                source: 'mmu-buildings-source',
                minzoom: 14,
                paint: {
                  // Neutral slate — IGNORE garish per-feature 'color' property
                  'fill-extrusion-color': [
                    'interpolate', ['linear'],
                    ['coalesce', ['get', 'height'], 10],
                    0,  '#cdd5de',
                    12, '#b0bbc8',
                    30, '#8d9cad',
                    50, '#6e8094',
                  ],
                  'fill-extrusion-height': ['coalesce', ['get', 'height'], 14],
                  'fill-extrusion-base':   ['coalesce', ['get', 'min_height'], 0],
                  'fill-extrusion-opacity': mmuOpacity,
                  'fill-extrusion-vertical-gradient': true,
                },
              } as any,
              insertBefore
            );
          }
        }

        applySunLighting(map);
      } catch (err) {
        console.warn('3D extrusion injection failed:', err);
      }
    },
    [applySunLighting, buildingMode]
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

  const handleStyleChange = useCallback(
    (newStyle: MapStyleType) => {
      const map = mapRef.current;
      if (!map) return;
      setMapStyle(newStyle);
      map.setStyle(getStyleConfig(newStyle));
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

      api
        .getCampusBuildingsGeoJson()
        .then((gj: any) => {
          const data = gj?.type === 'FeatureCollection' ? gj : gj?.data || gj;
          buildingDataRef.current = data;
          injectBuildingExtrusions(map, data);
        })
        .catch(() => injectBuildingExtrusions(map, null));
      applySunLighting(map);
      // Cinematic settle onto MMU Mullana campus
      map.easeTo({ center: DEFAULT_CENTER, zoom: 16.1, pitch: PITCH_3D, bearing: 28, duration: 900 });
    };

    map.on('load', onStyleReady);
    map.on('style.load', () => {
      if (!ready) return;
      const cached = buildingDataRef.current;
      if (cached) injectBuildingExtrusions(map, cached);
      applySunLighting(map);
    });
    map.on('rotate', () => setCurrentBearing(Math.round(map.getBearing())));

    return () => {
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

  // 2. Road route polyline — street-snapped, rounded joins & caps
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const cleanup = () => {
      if (map.getLayer('route-shadow')) map.removeLayer('route-shadow');
      if (map.getLayer('route-line')) map.removeLayer('route-line');
      if (map.getLayer('route-glow')) map.removeLayer('route-glow');
      if (map.getSource('route-path')) map.removeSource('route-path');
    };

    cleanup();
    if (!roadPath || roadPath.length < 2) return;

    try {
      map.addSource('route-path', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: roadPath },
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
          'line-color': activeRoute?.colorHex || '#3B82F6',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 15, 6, 18, 9],
          'line-opacity': 0.92,
        },
      });

      // Animated shimmer glow
      map.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'route-path',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': activeRoute?.colorHex || '#3B82F6',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 7, 15, 14, 18, 20],
          'line-opacity': 0.12,
          'line-blur': 4,
        },
      });
    } catch (e) {
      console.warn('Route line render error:', e);
    }

    return cleanup;
  }, [roadPath, mapLoaded, activeRoute]);

  // 3. Stop markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    stopMarkersRef.current.forEach((m) => m.remove());
    stopMarkersRef.current = [];

    if (!activeRoute?.stops) return;

    activeRoute.stops.forEach((stop, i) => {
      const isSelected = selectedStop?.id === stop.id;
      const el = document.createElement('div');
      el.className = 'select-none cursor-pointer';
      el.innerHTML = `
        <div class="relative flex flex-col items-center group">
          <div class="w-4 h-4 rounded-full border-2 ${isSelected ? 'bg-amber-400 border-amber-200 ring-2 ring-amber-400/50' : 'bg-slate-100 border-slate-600'} shadow-lg transition-all" style="box-shadow: 0 2px 8px rgba(0,0,0,0.4)">
          </div>
          <div class="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-bold text-white bg-slate-900/90 px-1.5 py-0.5 rounded-lg border border-white/10 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            ${i + 1}. ${stop.name}
          </div>
        </div>
      `;
      el.addEventListener('click', () => onSelectStop?.(stop));
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([stop.longitude, stop.latitude])
        .addTo(map);
      stopMarkersRef.current.push(marker);
    });
  }, [activeRoute, selectedStop, mapLoaded, onSelectStop]);

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

  // 5. Single active bus puck (VehicleLerpEngine smooth lerp)
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
      return;
    }

    const { latitude, longitude, bearing = 0, speedKmh = 0 } = activeBus;
    if (!latitude || !longitude) return;

    const live = isBusLive(activeBus);
    setCurrentSpeed(live ? speedKmh || 0 : 0);

    if (!busMarkerRef.current) {
      const el = document.createElement('div');
      busElRef.current = el;
      el.className = 'select-none pointer-events-none';
      el.innerHTML = `
        <div class="relative flex flex-col items-center" id="bus-puck-root">
          ${live ? '<div class="absolute inset-0 rounded-full animate-ping opacity-30" style="background:#ef4444;width:3.5rem;height:3.5rem;top:-0.75rem;left:-0.75rem;animation-duration:1.4s;"></div>' : ''}
          <div class="relative flex items-center justify-center w-10 h-10 rounded-full shadow-2xl" style="background:${live ? 'linear-gradient(135deg,#dc2626,#991b1b)' : 'linear-gradient(135deg,#475569,#334155)'};border:2.5px solid ${live ? '#fca5a5' : '#94a3b8'};">
            <svg viewBox="0 0 24 24" class="w-5 h-5 fill-white"><path d="M17 20H7v1a1 1 0 01-1 1H5a1 1 0 01-1-1v-1a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v12a2 2 0 01-2 2zm-2-5a1 1 0 100 2 1 1 0 000-2zm-6 0a1 1 0 100 2 1 1 0 000-2zM4 13h16V8H4v5z"/></svg>
          </div>
          <div class="mt-1 px-2 py-0.5 rounded-full text-[9px] font-black text-white shadow-xl" style="background:rgba(15,23,42,0.92);border:1px solid rgba(255,255,255,0.15);white-space:nowrap;">
            ${activeBus.busNumber || 'BUS-01'} ${live ? '' : '• PARKED'}
          </div>
        </div>
      `;
      busMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([longitude, latitude])
        .addTo(map);

      lerpEngineRef.current = new VehicleLerpEngine(
        [longitude, latitude],
        bearing || 0,
        (coords, b) => {
          busMarkerRef.current?.setLngLat(coords);
          setCurrentBearing(Math.round(b));
        },
        1200
      );
    } else {
      lerpEngineRef.current?.updateTarget([longitude, latitude], bearing || 0, 1200);
    }

    if (isFollowingBus && live) {
      map.easeTo({ center: [longitude, latitude], bearing: bearing ?? 0, duration: 800, easing: (t) => t });
    }
  }, [activeBus, mapLoaded, isFollowingBus]);

  const compassLabel = (b: number) => {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(((b % 360) + 360) % 360 / 45) % 8];
  };

  const isLive = isBusLive(activeBus);

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950">
      {/* Map Canvas */}
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" />

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

      {/* 2. Live Bus Status HUD — top left floating card */}
      {activeBus && (
        <div className={`absolute ${isCockpitMode ? 'top-3 left-3' : 'top-16 md:top-3 left-3'} z-20 pointer-events-auto`}>
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
        </div>
      </div>

      {/* 4. High-Precision Real-Time Speedometer & Telemetry Cockpit HUD */}
      <div className="absolute bottom-40 md:bottom-5 left-3 md:left-5 z-20 flex items-center gap-3 pointer-events-auto select-none">
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
              {compassLabel(currentBearing)} <span className="text-slate-400 font-mono text-[10px]">{currentBearing}°</span>
            </div>
            <div className="text-[10px] font-bold text-slate-400">
              {activeBus ? `${activeBus.boardedCount}/${activeBus.capacity} pax` : 'No Bus Active'}
            </div>
          </div>
        </div>
      </div>

      {/* 5. Selected stop info popup */}
      {selectedStop && (
        <div className="absolute bottom-40 md:bottom-5 right-3 md:right-24 z-20 pointer-events-auto">
          <div className="bg-slate-950/90 backdrop-blur-2xl border border-white/10 rounded-2xl p-3 shadow-2xl max-w-[200px]">
            <p className="text-[10px] font-black text-amber-400 uppercase tracking-wider">Stop #{selectedStop.stopSequence}</p>
            <p className="text-sm font-black text-white leading-tight mt-0.5">{selectedStop.name}</p>
            <p className="text-[10px] text-slate-400 mt-1">{selectedStop.landmark}</p>
            <div className="flex items-center gap-1 mt-1.5">
              <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded-full border border-emerald-900">
                {selectedStop.geofenceRadiusMeters}m radius
              </span>
              {selectedStop.isMajorHub && (
                <span className="text-[9px] font-bold text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded-full border border-amber-900">
                  Major Hub
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. North Compass Rose */}
      <div className="absolute bottom-40 md:bottom-5 right-3 md:right-5 z-10 pointer-events-none select-none">
        <div
          className="w-9 h-9 rounded-full bg-slate-950/80 backdrop-blur-xl border border-white/10 flex items-center justify-center shadow-xl"
          style={{ transform: `rotate(${-currentBearing}deg)`, transition: 'transform 0.5s ease' }}
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5">
            <path d="M12 2L8 10h8L12 2z" fill="#ef4444" />
            <path d="M12 22L8 14h8L12 22z" fill="#94a3b8" />
          </svg>
        </div>
      </div>
    </div>
  );
};
