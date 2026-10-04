import { LiveBusState } from '../types/index.js';

// Telemetry health states: LIVE (fresh + moving), PARKED (fresh, stationary),
// STALE (no packet for 15-120s), OFFLINE (never reported or silent > 120s).
export type TelemetryHealth = 'LIVE' | 'STALE' | 'PARKED' | 'OFFLINE';

export const HEALTH_DOT: Record<TelemetryHealth, string> = {
  LIVE: 'bg-emerald-400 animate-pulse',
  PARKED: 'bg-sky-400',
  STALE: 'bg-amber-400',
  OFFLINE: 'bg-slate-500',
};

export const HEALTH_CHIP: Record<TelemetryHealth, string> = {
  LIVE: 'bg-emerald-950 text-emerald-400 border-emerald-800',
  PARKED: 'bg-sky-950 text-sky-400 border-sky-800',
  STALE: 'bg-amber-950 text-amber-400 border-amber-800',
  OFFLINE: 'bg-slate-800 text-slate-400 border-slate-700',
};

export const STALE_AFTER_MS = 15_000;
export const OFFLINE_AFTER_MS = 120_000;

/**
 * Derive a bus's telemetry health from its last authentic packet. A bus with no
 * GPS fix is always OFFLINE — "GPS on but parked" (PARKED) is deliberately
 * distinct from "tracker offline" (OFFLINE), which matters for safety.
 */
export function getTelemetryHealth(bus: LiveBusState, nowMs: number): TelemetryHealth {
  if (bus.hasFix === false || !bus.lastPing) return 'OFFLINE';
  const ageMs = nowMs - new Date(bus.lastPing).getTime();
  if (Number.isNaN(ageMs)) return 'OFFLINE';
  if (ageMs >= OFFLINE_AFTER_MS) return 'OFFLINE';
  if (ageMs >= STALE_AFTER_MS) return 'STALE';
  return bus.speedKmh > 1 ? 'LIVE' : 'PARKED';
}
