// Road-snapping for route polylines so corridors follow REAL roads instead of
// straight point-to-point segments between sparse seed waypoints.
//
// Uses the free OSRM demo router (no API key). Results are cached in memory +
// localStorage per route, so each corridor costs one network request per
// device ever. Any failure (offline, rate-limit, abort) silently falls back
// to the raw waypoints — the map never breaks.

import type { RouteStop } from '../types/index.js';

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';
const memCache = new Map<string, [number, number][]>();

function cacheKey(routeId: string, stops: RouteStop[]): string {
  const pts = [...stops]
    .sort((a, b) => a.stopSequence - b.stopSequence)
    .map((s) => `${s.longitude.toFixed(5)},${s.latitude.toFixed(5)}`)
    .join(';');
  return `mmu-roadpath:${routeId}:${pts}`;
}

/**
 * Returns road-following [lon, lat] path through every stop in sequence.
 * Never rejects — falls back to `fallback` waypoints on any failure.
 */
export async function getRoadSnappedPath(
  routeId: string,
  stops: RouteStop[],
  fallback: [number, number][],
  signal?: AbortSignal
): Promise<[number, number][]> {
  if (!stops || stops.length < 2) return fallback;
  const key = cacheKey(routeId, stops);

  const memHit = memCache.get(key);
  if (memHit) return memHit;

  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored) as [number, number][];
      if (Array.isArray(parsed) && parsed.length > 1) {
        memCache.set(key, parsed);
        return parsed;
      }
    }
  } catch {
    /* storage unavailable — continue to network */
  }

  try {
    const coords = [...stops]
      .sort((a, b) => a.stopSequence - b.stopSequence)
      .map((s) => `${s.longitude},${s.latitude}`)
      .join(';');
    const res = await fetch(`${OSRM_BASE}/${coords}?overview=full&geometries=geojson`, { signal });
    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
    const data = await res.json();
    const line = data?.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;
    if (!Array.isArray(line) || line.length < 2) throw new Error('OSRM empty geometry');
    memCache.set(key, line);
    try {
      localStorage.setItem(key, JSON.stringify(line));
    } catch {
      /* quota/privacy — memory cache is enough */
    }
    return line;
  } catch {
    return fallback;
  }
}
