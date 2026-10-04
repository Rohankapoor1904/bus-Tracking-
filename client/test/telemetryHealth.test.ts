import { describe, it, expect } from 'vitest';
import { getTelemetryHealth } from '../src/utils/telemetryHealth.js';
import { LiveBusState } from '../src/types/index.js';

const NOW = new Date('2026-10-03T11:00:00.000Z').getTime();

function bus(overrides: Partial<LiveBusState> = {}): LiveBusState {
  return {
    busId: 'BUS-01',
    busNumber: 'MMU-01',
    registrationNumber: 'HR-01-AB-0001',
    model: 'Tata Starbus',
    status: 'EN_ROUTE',
    capacity: 50,
    boardedCount: 0,
    driverName: 'Test Driver',
    driverPhone: '0000000000',
    latitude: 30.2504,
    longitude: 77.0450,
    speedKmh: 30,
    bearing: 0,
    altitudeM: 265,
    accuracyM: 3,
    lastPing: new Date(NOW - 1000).toISOString(),
    hasFix: true,
    upcomingStopName: 'Gate',
    distanceToNextStopMeters: 100,
    etaMinutesUpcomingStop: 1,
    ...overrides,
  };
}

describe('getTelemetryHealth', () => {
  it('reports LIVE for a fresh, moving bus', () => {
    expect(getTelemetryHealth(bus({ speedKmh: 30 }), NOW)).toBe('LIVE');
  });

  it('reports PARKED for a fresh, stationary bus (GPS still on)', () => {
    expect(getTelemetryHealth(bus({ speedKmh: 0 }), NOW)).toBe('PARKED');
  });

  it('reports STALE when the last packet is 15-120s old', () => {
    const b = bus({ lastPing: new Date(NOW - 30_000).toISOString() });
    expect(getTelemetryHealth(b, NOW)).toBe('STALE');
  });

  it('reports OFFLINE when silent for more than 120s', () => {
    const b = bus({ lastPing: new Date(NOW - 130_000).toISOString() });
    expect(getTelemetryHealth(b, NOW)).toBe('OFFLINE');
  });

  it('reports OFFLINE when the bus has no GPS fix', () => {
    expect(getTelemetryHealth(bus({ hasFix: false }), NOW)).toBe('OFFLINE');
  });

  it('reports OFFLINE when there is no last ping', () => {
    expect(getTelemetryHealth(bus({ lastPing: null }), NOW)).toBe('OFFLINE');
  });

  it('reports OFFLINE for an unparseable last ping', () => {
    expect(getTelemetryHealth(bus({ lastPing: 'not-a-date' }), NOW)).toBe('OFFLINE');
  });

  it('treats the exact 15s and 120s boundaries as STALE and OFFLINE', () => {
    expect(getTelemetryHealth(bus({ lastPing: new Date(NOW - 15_000).toISOString() }), NOW)).toBe('STALE');
    expect(getTelemetryHealth(bus({ lastPing: new Date(NOW - 120_000).toISOString() }), NOW)).toBe('OFFLINE');
  });
});
