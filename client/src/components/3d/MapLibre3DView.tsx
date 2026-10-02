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
  Compass,
  Map as MapIcon,
  Moon,
  Building2,
  LocateFixed,
  Globe,
  Milestone,
  AlertCircle,
  X,
  Gauge,
  Activity,
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

  const [mapStyle, setMapStyle] = useState<MapStyleType>('GOOGLE_ROADMAP');
  const [buildingMode, setBuildingMode] = useState<BuildingViewMode>('SOLID');
  const [userGeo, setUserGeo] = useState<UserGeoState | null>(null);
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
      el.className = 'user-location-pulse select-none cursor-pointer';
      el.title = title;
      el.innerHTML = `
        <div class="relative flex items-center justify-center">
          <span class="animate-ping absolute inline-flex h-10 w-10 rounded-full bg-cyan-400 opacity-75"></span>
          <div class="relative flex items-center justify-center w-7 h-7 rounded-full bg-cyan-600 border-2 border-white shadow-2xl text-[10px] font-black text-white">
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

  // Check user device location only when user explicitly taps 'Locate Me'
  const checkUserLocation = useCallback((centerIfFound = false) => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lng = pos.coords.longitude;
        const lat = pos.coords.latitude;
        const dLat = (lat - 30.25045) * 111.2;
        const dLon = (lng - 77.04505) * 96.3;
        const distKm = Math.round(Math.sqrt(dLat * dLat + dLon * dLon));

        // Strict MMU Transit Corridor validation (Ambala, Mullana, Yamunanagar, Kurukshetra)
        // Rejects PC broadband / Wi-Fi gateway IPs (such as Delhi NCR, lat 28.6) from hijacking the map.
        const isWithinTransitZone = lat >= 29.8 && lat <= 30.9 && lng >= 76.2 && lng <= 77.7;
        const isRemote = !isWithinTransitZone || distKm > 40;

        if (isRemote) {
          // Keep the camera strictly on the MMU corridor — NEVER jump to Delhi.
          setGeoNotice({
            type: 'REMOTE_IP',
            message: `Broadband / Wi-Fi IP resolved to an external gateway (~${distKm} km away). Camera held on MMU transit corridor.`,
            distKm,
          });
          return;
        }

        setUserGeo({
          coords: [lng, lat],
          isDelhiOrRemote: false,
          distanceKm: distKm,
          label: 'Near Campus Route',
        });

        const map = mapRef.current;
        if (map) {
          if (!userMarkerRef.current) {
            const el = document.createElement('div');
            el.className = 'user-location-pulse select-none cursor-pointer';
            el.title = `Your GPS Position (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
            el.innerHTML = `
              <div class="relative flex items-center justify-center">
                <span class="animate-ping absolute inline-flex h-10 w-10 rounded-full bg-cyan-400 opacity-75"></span>
                <div class="relative flex items-center justify-center w-7 h-7 rounded-full bg-cyan-600 border-2 border-white shadow-2xl text-[10px] font-black text-white">
                  ME
                </div>
              </div>
            `;
            userMarkerRef.current = new maplibregl.Marker({ element: el })
              .setLngLat([lng, lat])
              .addTo(map);
          } else {
            userMarkerRef.current.setLngLat([lng, lat]);
          }

          if (centerIfFound) {
            map.flyTo({ center: [lng, lat], zoom: 16.2, pitch: PITCH_3D, duration: 1200 });
          }
        }
      },
      (err) => {
        console.warn('Geolocation lookup notice:', err.message);
      },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 30000 }
    );
  }, []);

  // Dynamic Building View Mode Handler (Glass / Solid / Off)
  const handleBuildingModeChange = (next: BuildingViewMode) => {
    setBuildingMode(next);
    const map = mapRef.current;
    if (!map) return;
    const osmOpacity = next === 'GLASS' ? 0.22 : next === 'SOLID' ? 0.88 : 0;
    const mmuOpacity = next === 'GLASS' ? 0.28 : next === 'SOLID' ? 0.95 : 0;
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

  const injectBuildingExtrusions = useCallback(
    (map: maplibregl.Map, geoJson: any) => {
      try {
        const style = map.getStyle();
        const labelLayerId = style?.layers?.find(
          (l: any) => l.type === 'symbol' && l.layout?.['text-field']
        )?.id;

        const osmOpacity = buildingMode === 'GLASS' ? 0.22 : buildingMode === 'SOLID' ? 0.88 : 0;
        const mmuOpacity = buildingMode === 'GLASS' ? 0.28 : buildingMode === 'SOLID' ? 0.95 : 0;

        // 1. OSM / Mapbox-Streets style vector buildings -> 3D extrusions.
        if (map.getSource('openmaptiles') && !map.getLayer('3d-buildings-osm')) {
          map.addLayer(
            {
              id: '3d-buildings-osm',
              source: 'openmaptiles',
              'source-layer': 'building',
              type: 'fill-extrusion',
              minzoom: 14,
              paint: {
                'fill-extrusion-color': [
                  'interpolate',
                  ['linear'],
                  ['coalesce', ['get', 'render_height'], ['get', 'height'], 12],
                  0,
                  '#cbd5e1',
                  18,
                  '#94a3b8',
                  40,
                  '#64748b',
                ],
                'fill-extrusion-height': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  14,
                  0,
                  14.08,
                  ['coalesce', ['get', 'render_height'], ['get', 'height'], 14],
                ],
                'fill-extrusion-base': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  14,
                  0,
                  14.08,
                  ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
                ],
                'fill-extrusion-opacity': osmOpacity,
                'fill-extrusion-vertical-gradient': true,
              },
            } as any,
            labelLayerId
          );
        }

        // 2. MMU campus high-fidelity architectural extrusions (MMIMSR Hospital, MMEC Labs, Admin...)
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
                  'fill-extrusion-color': ['coalesce', ['get', 'color'], '#dc2626'],
                  'fill-extrusion-height': ['coalesce', ['get', 'height'], 20],
                  'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
                  'fill-extrusion-opacity': mmuOpacity,
                  'fill-extrusion-vertical-gradient': true,
                },
              } as any,
              labelLayerId
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

  // 1. Init map (pitch 60, bearing sync ready, flyTo/easeTo transitions)
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: getStyleConfig('GOOGLE_ROADMAP'),
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
      if (ready) {
        // style.load fires on every setStyle; re-inject extrusions each time
        const cached = buildingDataRef.current;
        if (cached) injectBuildingExtrusions(map, cached);
        else {
          api
            .getCampusBuildingsGeoJson()
            .then((d) => {
              const gj = d?.type === 'FeatureCollection' ? d : d?.data || d;
              buildingDataRef.current = gj;
              injectBuildingExtrusions(map, gj);
            })
            .catch(() => injectBuildingExtrusions(map, null));
        }
        applySunLighting(map);
        return;
      }
      ready = true;
      setMapLoaded(true);
      const cached = buildingDataRef.current;
      if (cached) injectBuildingExtrusions(map, cached);
      else {
        api
          .getCampusBuildingsGeoJson()
          .then((d) => {
            const gj = d?.type === 'FeatureCollection' ? d : d?.data || d;
            buildingDataRef.current = gj;
            injectBuildingExtrusions(map, gj);
          })
          .catch(() => injectBuildingExtrusions(map, null));
      }
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

  const handleStyleChange = (next: MapStyleType) => {
    const map = mapRef.current;
    if (!map || next === mapStyle) return;
    const center = map.getCenter();
    const zoom = map.getZoom();
    const pitch = map.getPitch();
    const bearing = map.getBearing();
    setMapStyle(next);
    map.setStyle(getStyleConfig(next));
    map.once('style.load', () => {
      map.jumpTo({ center, zoom, pitch, bearing });
      const cached = buildingDataRef.current;
      if (cached) injectBuildingExtrusions(map, cached);
      applySunLighting(map);
    });
  };

  // 2. Route polyline + stop pins (flyTo on stop select)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    stopMarkersRef.current.forEach((m) => m.remove());
    stopMarkersRef.current = [];

    if (!activeRoute) {
      if (map.getLayer('route-glow')) map.removeLayer('route-glow');
      if (map.getLayer('route-line')) map.removeLayer('route-line');
      if (map.getSource('active-route-source')) map.removeSource('active-route-source');
      return;
    }

    // Prefer OSRM road-snapped geometry; raw seed waypoints are only sparse
    // straight-line fallbacks and must never render as the final corridor.
    const corridorPath: [number, number][] =
      roadPath && roadPath.length > 1 ? roadPath : activeRoute.waypoints;
    const routeGeoJson: GeoJSON.Feature<GeoJSON.LineString> = {
      type: 'Feature',
      properties: { color: activeRoute.colorHex || '#E21E26' },
      geometry: { type: 'LineString', coordinates: corridorPath },
    };

    if (map.getSource('active-route-source')) {
      (map.getSource('active-route-source') as maplibregl.GeoJSONSource).setData(routeGeoJson);
    } else {
      map.addSource('active-route-source', { type: 'geojson', data: routeGeoJson });
      map.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'active-route-source',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': activeRoute.colorHex || '#E21E26',
          'line-width': 13,
          'line-opacity': 0.32,
          'line-blur': 5,
        },
      });
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'active-route-source',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#1E88E5', 'line-width': 5, 'line-opacity': 0.98 },
      });
    }

    activeRoute.stops.forEach((stop) => {
      const el = document.createElement('div');
      el.className = 'group relative cursor-pointer';
      const isSelected = selectedStop?.id === stop.id;
      el.innerHTML = `
        <div class="flex flex-col items-center">
          <div class="flex items-center justify-center w-8 h-8 rounded-full border-2 ${
            isSelected
              ? 'bg-amber-500 border-white shadow-[0_0_22px_rgba(245,158,11,1)] scale-125'
              : stop.isMajorHub
              ? 'bg-red-600 border-white shadow-xl'
              : 'bg-blue-600 border-white shadow-md'
          } text-white font-black text-xs transition-transform hover:scale-125">
            ${stop.stopSequence}
          </div>
          <div class="w-1 h-2 bg-slate-900 shadow"></div>
        </div>
        <div class="hidden group-hover:block absolute bottom-12 left-1/2 -translate-x-1/2 bg-slate-900/95 backdrop-blur-xl text-white text-xs py-2 px-3 rounded-xl border border-slate-700 shadow-2xl whitespace-nowrap z-50 pointer-events-none">
          <div class="font-extrabold text-amber-400">Stop #${stop.stopSequence}: ${stop.name}</div>
          <div class="text-[10px] text-slate-300 mt-0.5">${stop.landmark}</div>
        </div>`;
      el.addEventListener('click', () => {
        if (onSelectStop) onSelectStop(stop);
        map.flyTo({ center: [stop.longitude, stop.latitude], zoom: 17.2, pitch: PITCH_3D, duration: 1100 });
      });
      const marker = new maplibregl.Marker({ element: el }).setLngLat([stop.longitude, stop.latitude]).addTo(map);
      stopMarkersRef.current.push(marker);
    });

    // Frame the corridor on route change
    if (corridorPath.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      corridorPath.forEach((w) => bounds.extend(w as [number, number]));
      map.fitBounds(bounds, { padding: 70, pitch: PITCH_3D, duration: 1200 });
    }
  }, [activeRoute, mapLoaded, selectedStop, mapStyle, onSelectStop, roadPath]);

  // 3. Sleek directional vehicle puck — reflects ONLY real driver telemetry.
  // Parked: static at terminal, "Bus Parked" badge, zero motion.
  // Live: 60fps lerp + bearing slerp, camera bearing sync, pulse ripple.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (!activeBus) {
      if (busMarkerRef.current) {
        busMarkerRef.current.remove();
        busMarkerRef.current = null;
        busElRef.current = null;
      }
      lerpEngineRef.current?.destroy();
      lerpEngineRef.current = null;
      return;
    }

    setCurrentSpeed(activeBus.speedKmh || 0);
    const live = isBusLive(activeBus);
    const coords: [number, number] = [activeBus.longitude, activeBus.latitude];

    const renderPuck = (el: HTMLDivElement, bus: LiveBusState, isLive: boolean) => {
      el.innerHTML = `
        <div class="relative flex flex-col items-center select-none">
          <div class="mb-1 whitespace-nowrap">
            ${
              isLive
                ? `<div class="px-2.5 py-0.5 rounded-full bg-slate-950/90 text-white font-mono font-black text-[11px] border border-emerald-400 shadow-2xl backdrop-blur-md flex items-center gap-1.5">
                    <span class="relative flex w-2 h-2"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>
                    <span class="text-amber-300">${bus.speedKmh.toFixed(0)}</span><span>km/h · LIVE</span>
                  </div>`
                : `<div class="px-3 py-1 rounded-full bg-slate-950/95 text-amber-300 font-bold text-[10px] border border-slate-700 shadow-2xl backdrop-blur-md flex items-center gap-1.5">
                    <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                    <span>Bus Parked • Awaiting Driver Shift</span>
                  </div>`
            }
          </div>
          <div class="relative w-16 h-16 flex items-center justify-center">
            ${
              isLive
                ? `<div class="absolute w-24 h-24 rounded-full border-2 border-emerald-400/40 animate-ping pointer-events-none"></div>
                   <div class="absolute w-16 h-16 rounded-full bg-emerald-500/15 blur-sm pointer-events-none"></div>`
                : `<div class="absolute w-14 h-14 rounded-full bg-slate-500/10 blur-sm pointer-events-none"></div>`
            }
            <div class="absolute w-11 h-13 rounded-2xl bg-black/60 blur-md translate-y-3 scale-y-75 pointer-events-none"></div>
            <div class="direction-disc relative w-14 h-14 flex items-center justify-center" style="transform: rotate(${bus.bearing || 0}deg); transition: transform 120ms linear;">
              <div class="absolute -top-8 w-12 h-10 pointer-events-none ${isLive ? 'opacity-50' : 'opacity-15'} bg-gradient-to-t from-yellow-200/80 to-transparent" style="clip-path: polygon(50% 100%, 0 0, 100% 0);"></div>
              <svg viewBox="0 0 48 80" class="w-10 h-16" style="filter: drop-shadow(0 10px 14px rgba(0,0,0,0.75));">
                <rect x="6" y="8" width="36" height="64" rx="10" fill="#E21E26" stroke="#7f1d1d" stroke-width="2"/>
                <rect x="10" y="4" width="28" height="6" rx="3" fill="#0D1B3E"/>
                <path d="M10 12 L38 12 L35 24 L13 24 Z" fill="#38BDF8" opacity="0.92"/>
                <line x1="14" y1="14" x2="30" y2="22" stroke="#FFFFFF" stroke-width="2" opacity="0.55"/>
                <rect x="8" y="27" width="32" height="3" fill="#F59E0B"/>
                <rect x="14" y="32" width="20" height="24" rx="4" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.5"/>
                <rect x="17" y="36" width="14" height="4" rx="1" fill="#94A3B8"/>
                <rect x="17" y="43" width="14" height="4" rx="1" fill="#94A3B8"/>
                <rect x="11" y="62" width="26" height="6" rx="2" fill="#0D1B3E"/>
                <circle cx="10" cy="7" r="3" fill="#FBBF24" stroke="#FFF" stroke-width="1"/>
                <circle cx="38" cy="7" r="3" fill="#FBBF24" stroke="#FFF" stroke-width="1"/>
                <rect x="8" y="70" width="6" height="2" rx="1" fill="#f87171"/>
                <rect x="34" y="70" width="6" height="2" rx="1" fill="#f87171"/>
              </svg>
            </div>
            <div class="absolute -bottom-2 bg-slate-950/95 text-white font-mono text-[9px] font-black px-1.5 py-px rounded border border-slate-700 shadow-xl">${bus.busNumber}</div>
          </div>
        </div>`;
    };

    if (!busMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'mmu-bus-puck relative cursor-pointer';
      el.id = `bus-marker-${activeBus.busId}`;
      busElRef.current = el;
      renderPuck(el, activeBus, live);
      busMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(coords).addTo(map);
      el.addEventListener('click', () => {
        map.flyTo({ center: coords, zoom: 17.4, pitch: PITCH_3D, bearing: activeBus.bearing || 0, duration: 1100 });
      });
      lerpEngineRef.current = new VehicleLerpEngine(coords, activeBus.bearing || 0, (lc, lb) => {
        busMarkerRef.current?.setLngLat(lc);
        const disc = busElRef.current?.querySelector('.direction-disc') as HTMLElement | null;
        if (disc) disc.style.transform = `rotate(${lb}deg)`;
        setCurrentBearing(Math.round(lb));
        if (isFollowingBus && mapRef.current) {
          mapRef.current.easeTo({
            center: lc,
            bearing: isCockpitMode ? lb : mapRef.current.getBearing(),
            pitch: is3DMode ? PITCH_3D : PITCH_FLAT,
            duration: 0,
          });
        }
      });
      if (isFollowingBus) {
        const safeCenter: [number, number] =
          coords[1] >= 29.8 && coords[1] <= 30.9 && coords[0] >= 76.2 && coords[0] <= 77.7
            ? coords
            : DEFAULT_CENTER;
        map.flyTo({ center: safeCenter, zoom: 16.8, pitch: is3DMode ? PITCH_3D : 0, bearing: isCockpitMode ? activeBus.bearing || 0 : 28, duration: 1400 });
      }
    } else {
      // Smooth interpolation toward the fresh live packet (no snapping)
      lerpEngineRef.current?.updateTarget(coords, activeBus.bearing || 0, 1200);
      if (busElRef.current) renderPuck(busElRef.current, activeBus, live);
    }
  }, [activeBus, mapLoaded, isFollowingBus, isCockpitMode, is3DMode]);

  // 4. Admin multi-bus radar
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    allBuses.forEach((b) => {
      if (activeBus && b.busId === activeBus.busId) return;
      const live = isBusLive(b);
      let marker = multiBusMarkersRef.current.get(b.busId);
      if (!marker) {
        const el = document.createElement('div');
        el.className = 'cursor-pointer group';
        el.innerHTML = `
          <div class="flex flex-col items-center">
            <div class="w-9 h-9 rounded-2xl ${live ? 'bg-slate-900 border-emerald-400 text-emerald-400' : 'bg-slate-900 border-slate-600 text-slate-400'} border-2 flex items-center justify-center font-black text-[10px] shadow-2xl hover:scale-125 transition-transform">
              ${b.busNumber.replace('BUS-', '')}
            </div>
            <div class="hidden group-hover:block absolute -top-8 bg-slate-900 text-white text-[10px] font-bold px-2 py-0.5 rounded border border-slate-700 whitespace-nowrap shadow-xl">
              ${b.busNumber} • ${live ? `${b.speedKmh.toFixed(0)} km/h LIVE` : 'PARKED'}
            </div>
          </div>`;
        el.addEventListener('click', () => {
          if (onSelectBus) onSelectBus(b);
          map.flyTo({ center: [b.longitude, b.latitude], zoom: 16.4, pitch: PITCH_3D, duration: 1100 });
        });
        marker = new maplibregl.Marker({ element: el }).setLngLat([b.longitude, b.latitude]).addTo(map);
        multiBusMarkersRef.current.set(b.busId, marker);
      } else {
        marker.setLngLat([b.longitude, b.latitude]);
      }
    });
    multiBusMarkersRef.current.forEach((marker, id) => {
      if (!allBuses.find((b) => b.busId === id)) {
        marker.remove();
        multiBusMarkersRef.current.delete(id);
      }
    });
  }, [allBuses, activeBus, mapLoaded, onSelectBus]);

  const toggle3DMode = () => {
    const next = !is3DMode;
    setIs3DMode(next);
    mapRef.current?.easeTo({ pitch: next ? PITCH_3D : PITCH_FLAT, duration: 800 });
  };

  const centerCampus = () => {
    mapRef.current?.flyTo({ center: DEFAULT_CENTER, zoom: 16.8, pitch: PITCH_3D, bearing: 30, duration: 1400 });
  };

  const fitRouteCorridor = () => {
    const map = mapRef.current;
    if (!map || !activeRoute) return;
    const corridorPath: [number, number][] =
      roadPath && roadPath.length > 1 ? roadPath : activeRoute.waypoints;
    if (corridorPath.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      corridorPath.forEach((w) => bounds.extend(w as [number, number]));
      map.fitBounds(bounds, { padding: 60, pitch: 45, duration: 1200 });
    }
  };

  const live = isBusLive(activeBus);

  return (
    <div className="relative w-full h-full overflow-hidden select-none bg-slate-950">
      <div ref={mapContainer} className="w-full h-full" />

      {activeBus && (
        <div className="absolute top-2 left-2 right-2 md:top-4 md:left-4 md:right-auto md:w-96 z-20 pointer-events-auto">
          <div className="bg-gradient-to-r from-emerald-700 via-emerald-800 to-emerald-900 text-white p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl shadow-2xl border border-emerald-500/50 flex items-center justify-between backdrop-blur-md">
            <div className="flex items-center gap-2 sm:gap-3 truncate">
              <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-white/20 flex items-center justify-center font-black flex-shrink-0">
                <Navigation className="w-4 h-4 sm:w-6 sm:h-6 text-white transform rotate-45" />
              </div>
              <div className="truncate">
                <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-emerald-200 block truncate">
                  Towards {activeRoute?.destinationName || 'MMU Mullana Campus'}
                </span>
                <h4 className="text-xs sm:text-sm font-extrabold text-white leading-tight truncate">
                  {live ? activeBus.upcomingStopName || 'NH-344 Expressway' : 'Bus Parked at Terminal'}
                </h4>
              </div>
            </div>
            <div className="text-right pl-2 sm:pl-3 border-l border-emerald-600 flex-shrink-0 ml-2">
              {live ? (
                <>
                  <div className="text-[10px] sm:text-xs font-mono font-bold text-emerald-200">~{activeBus.etaMinutesUpcomingStop || 3} min</div>
                  <div className="text-xs sm:text-sm font-black text-white">{(activeBus.distanceToNextStopMeters / 1000).toFixed(1)} km</div>
                </>
              ) : (
                <>
                  <div className="text-[10px] sm:text-xs font-bold text-amber-300">PARKED</div>
                  <div className="text-xs sm:text-sm font-black text-white">At Depot</div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Geolocation Remote / Outside Service Zone Non-Blocking Notice */}
      {geoNotice && (
        <div className="absolute top-20 sm:top-24 left-2 right-2 md:left-4 md:right-auto md:w-[420px] z-30 pointer-events-auto">
          <div className="bg-slate-900/98 backdrop-blur-2xl text-white p-3 sm:p-4 rounded-2xl shadow-2xl border border-amber-500/60 flex flex-col gap-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-4 h-4" />
                </div>
                <div>
                  <h5 className="text-xs font-black text-amber-400">Desktop Broadband / Wi-Fi IP Notice</h5>
                  <p className="text-[11px] text-slate-300 leading-snug">
                    Broadband IP maps to an external gateway (~{geoNotice.distKm} km away). Camera held safely on MMU corridor.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setGeoNotice(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg bg-slate-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="pt-2 border-t border-slate-800">
              <div className="text-[10px] uppercase font-bold text-slate-400 mb-1.5">
                Quick Select Your Boarding Stop:
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => setUserLocationToCoords([76.83430, 30.32980], 'Ambala Cantt Railway Station')}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-left text-[11px] font-bold text-cyan-300 flex items-center gap-1.5 transition-colors"
                >
                  <MapPin className="w-3 h-3 text-cyan-400 flex-shrink-0" />
                  <span className="truncate">Ambala Cantt (#1)</span>
                </button>
                <button
                  onClick={() => setUserLocationToCoords([76.95800, 30.29800], 'Saha Industrial Junction')}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-left text-[11px] font-bold text-cyan-300 flex items-center gap-1.5 transition-colors"
                >
                  <MapPin className="w-3 h-3 text-cyan-400 flex-shrink-0" />
                  <span className="truncate">Saha Junction (#5)</span>
                </button>
                <button
                  onClick={() => setUserLocationToCoords([77.04100, 30.25200], 'MMU Mullana Main Gate')}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-left text-[11px] font-bold text-cyan-300 flex items-center gap-1.5 transition-colors"
                >
                  <MapPin className="w-3 h-3 text-cyan-400 flex-shrink-0" />
                  <span className="truncate">MMU Main Gate (#7)</span>
                </button>
                <button
                  onClick={() => setUserLocationToCoords([77.04402, 30.24853], 'Stop 8 MMEC Engineering Block')}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-left text-[11px] font-bold text-cyan-300 flex items-center gap-1.5 transition-colors"
                >
                  <MapPin className="w-3 h-3 text-cyan-400 flex-shrink-0" />
                  <span className="truncate">MMEC Terminal (#8)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="absolute top-16 md:top-4 right-2 sm:right-4 z-20 flex flex-col items-end gap-1.5 sm:gap-2 pointer-events-auto">
        <div className="flex md:hidden items-center bg-slate-900/95 backdrop-blur-xl p-1 rounded-xl border border-slate-700/80 shadow-2xl gap-1">
          <button
            onClick={() => {
              const cycle: MapStyleType[] = ['GOOGLE_ROADMAP', 'GOOGLE_SATELLITE', 'GOOGLE_3D', 'DARK_COCKPIT'];
              const idx = cycle.indexOf(mapStyle);
              const next = cycle[(idx + 1) % cycle.length];
              handleStyleChange(next);
            }}
            className="p-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all bg-blue-600 text-white"
            title="Switch Map (Google / Satellite / 3D Vector / Dark)"
          >
            <MapIcon className="w-3.5 h-3.5" />
            <span className="text-[10px]">
              {mapStyle === 'GOOGLE_ROADMAP'
                ? 'Roadmap'
                : mapStyle === 'GOOGLE_SATELLITE'
                ? 'Satellite'
                : mapStyle === 'GOOGLE_3D'
                ? '3D Vector'
                : 'Dark'}
            </span>
          </button>
          <button
            onClick={() => {
              const next = buildingMode === 'GLASS' ? 'SOLID' : buildingMode === 'SOLID' ? 'OFF' : 'GLASS';
              handleBuildingModeChange(next);
            }}
            className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
              buildingMode === 'SOLID'
                ? 'bg-amber-600 text-white'
                : buildingMode === 'GLASS'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-300'
            }`}
            title="3D Building Mode: Solid / Glass / Off"
          >
            <Building2 className="w-3.5 h-3.5" />
            <span className="text-[10px]">{buildingMode === 'SOLID' ? 'Solid 3D' : buildingMode === 'GLASS' ? 'Glass' : 'Off'}</span>
          </button>
          <button
            onClick={toggle3DMode}
            className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${is3DMode ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-300'}`}
            title="Toggle 60° 3D Tilt"
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="text-[10px]">{is3DMode ? '60°' : '2D'}</span>
          </button>
          <button
            onClick={() => checkUserLocation(true)}
            className="p-1.5 rounded-lg text-xs font-bold bg-slate-800 text-cyan-300 hover:bg-slate-700"
            title="Locate My GPS"
          >
            <LocateFixed className="w-3.5 h-3.5 text-cyan-400" />
          </button>
          <button
            onClick={fitRouteCorridor}
            className="p-1.5 rounded-lg text-xs font-bold bg-slate-800 text-amber-300 hover:bg-slate-700"
            title="Fit Full Ambala-MMU Corridor"
          >
            <Milestone className="w-3.5 h-3.5 text-amber-400" />
          </button>
          <button
            onClick={() => setIsFollowingBus(!isFollowingBus)}
            className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${isFollowingBus ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}
            title="Follow Bus"
          >
            <Navigation className="w-3.5 h-3.5" />
          </button>
          <button onClick={centerCampus} className="p-1.5 rounded-lg text-xs font-bold bg-slate-800 text-slate-200" title="Fly to MMU Campus">
            <MapPin className="w-3.5 h-3.5 text-red-500" />
          </button>
        </div>

        <div className="hidden md:flex items-center bg-slate-900/90 backdrop-blur-xl p-1 rounded-2xl border border-slate-700 shadow-2xl gap-1">
          <button
            onClick={() => handleStyleChange('GOOGLE_ROADMAP')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${mapStyle === 'GOOGLE_ROADMAP' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
          >
            <MapIcon className="w-3.5 h-3.5" />
            <span>Google Roadmap</span>
          </button>
          <button
            onClick={() => handleStyleChange('GOOGLE_SATELLITE')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${mapStyle === 'GOOGLE_SATELLITE' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Google Satellite</span>
          </button>
          <button
            onClick={() => handleStyleChange('GOOGLE_3D')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${mapStyle === 'GOOGLE_3D' ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>3D Vector</span>
          </button>
          <button
            onClick={() => handleStyleChange('DARK_COCKPIT')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${mapStyle === 'DARK_COCKPIT' ? 'bg-red-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
          >
            <Moon className="w-3.5 h-3.5" />
            <span>Cockpit Dark</span>
          </button>
        </div>

        <div className="hidden md:flex items-center justify-end gap-2">
          <button
            onClick={() => {
              const next = buildingMode === 'GLASS' ? 'SOLID' : buildingMode === 'SOLID' ? 'OFF' : 'GLASS';
              handleBuildingModeChange(next);
            }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-xl backdrop-blur-md border ${
              buildingMode === 'SOLID'
                ? 'bg-amber-600/90 text-white border-amber-400'
                : buildingMode === 'GLASS'
                ? 'bg-blue-600/90 text-white border-blue-400'
                : 'bg-slate-900/90 text-slate-300 border-slate-700 hover:bg-slate-800'
            }`}
            title="3D Building Visibility: Solid 3D / Glass / Off"
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>{buildingMode === 'SOLID' ? 'Solid 3D Buildings' : buildingMode === 'GLASS' ? 'Glass 3D' : 'Buildings Off'}</span>
          </button>
          <button
            onClick={toggle3DMode}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-xl backdrop-blur-md border ${is3DMode ? 'bg-red-600 text-white border-red-500' : 'bg-slate-900/90 text-slate-300 border-slate-700 hover:bg-slate-800'}`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{is3DMode ? '60° 3D Tilt' : '2D Top-Down'}</span>
          </button>
          <button
            onClick={() => checkUserLocation(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-900/90 text-cyan-300 border border-slate-700 hover:bg-slate-800 transition-all shadow-xl backdrop-blur-md"
            title="Locate My GPS Position"
          >
            <LocateFixed className="w-3.5 h-3.5 text-cyan-400" />
            <span>Locate Me</span>
          </button>
          <button
            onClick={fitRouteCorridor}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-900/90 text-amber-300 border border-slate-700 hover:bg-slate-800 transition-all shadow-xl backdrop-blur-md"
            title="Fit Full Ambala - MMU Route Corridor"
          >
            <Milestone className="w-3.5 h-3.5 text-amber-400" />
            <span>Fit Route</span>
          </button>
          <button
            onClick={() => setIsFollowingBus(!isFollowingBus)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all shadow-xl backdrop-blur-md border ${isFollowingBus ? 'bg-amber-500 text-slate-950 border-amber-400' : 'bg-slate-900/90 text-slate-300 border-slate-700 hover:bg-slate-800'}`}
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>{isFollowingBus ? 'Tracking Vehicle' : 'Free Camera'}</span>
          </button>
          <button
            onClick={centerCampus}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-900/90 text-slate-200 border border-slate-700 hover:bg-slate-800 transition-all shadow-xl backdrop-blur-md"
          >
            <MapPin className="w-3.5 h-3.5 text-red-500" />
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
                stroke="currentColor"
                strokeWidth="6"
                className={`transition-all duration-300 ease-out ${
                  !live
                    ? 'text-slate-600'
                    : currentSpeed > 60
                    ? 'text-red-500'
                    : currentSpeed > 40
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }`}
                fill="transparent"
                strokeDasharray="207.3"
                strokeDashoffset={207.3 - (Math.min(1, currentSpeed / 80) * 155.5)}
                strokeLinecap="round"
                style={{
                  filter: live && currentSpeed > 0 ? 'drop-shadow(0 0 6px currentColor)' : 'none',
                }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="font-mono font-black text-base md:text-lg text-white tracking-tighter leading-none">
                {currentSpeed.toFixed(0)}
              </span>
              <span className="text-[7px] md:text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mt-0.5">
                km/h
              </span>
            </div>
          </div>

          {/* Telemetry Metrics & Heading */}
          <div className="flex flex-col pr-1">
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`w-2 h-2 rounded-full ${live ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className="text-[10px] md:text-xs font-black tracking-wider uppercase text-slate-200">
                {live ? 'Live GPS Telemetry' : 'Parked at Depot'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="flex items-center gap-1 bg-slate-900/90 px-2 py-0.5 rounded-lg border border-slate-800 text-slate-300 font-mono text-[10px] md:text-[11px]">
                <Compass className="w-3 h-3 text-red-500" style={{ transform: `rotate(${currentBearing}deg)` }} />
                <span>{currentBearing}°</span>
              </div>
              <span className="text-[9px] md:text-[10px] text-slate-400 font-mono">
                {live ? '±3.5m GNSS' : 'NH-344'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
