import assert from 'assert';
import WebSocket from 'ws';

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:4000';
const WS_URL = BASE_URL.replace(/^http/, 'ws') + '/ws';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'MMU@Secure2026';

async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, data };
}

function openSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function waitForEvent(ws: WebSocket, eventName: string, timeoutMs = 4000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${eventName}`)), timeoutMs);
    ws.on('message', (d) => {
      const msg = JSON.parse(d.toString());
      if (msg.event === eventName) {
        clearTimeout(timer);
        resolve(msg);
      }
    });
  });
}

async function login(email: string, password = DEMO_PASSWORD, role?: string) {
  const res = await api('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, role }),
  });
  assert.strictEqual(res.status, 200, `login failed for ${email}: ${JSON.stringify(res.data)}`);
  return res.data.data;
}

let passed = 0;
function ok(label: string) {
  passed++;
  console.log(`  \u2713 ${label}`);
}

async function run() {
  console.log('--- MMU FleetRadar 3D Production Verification Suite ---');

  // 1. Health + DB readiness
  const health = await api('/health');
  assert.strictEqual(health.status, 200);
  assert.strictEqual(health.data.database, 'UP');
  ok('Healthcheck + PostgreSQL readiness');

  // 2. Auth
  const admin = await login('admin@mmumullana.org');
  const driver = await login('driver.rajesh@mmumullana.org');
  const student = await login('student.aarav@mmumullana.org');
  assert.strictEqual(admin.user.role, 'ADMIN');
  assert.strictEqual(driver.user.role, 'DRIVER');
  ok('Role logins (admin/driver/student)');

  // 3. Login rejects wrong password
  const bad = await api('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@mmumullana.org', password: 'wrong-password-123' }),
  });
  assert.strictEqual(bad.status, 401);
  ok('Invalid credentials rejected (401)');

  // 4. Routes & 3D buildings
  const routes = await api('/api/v1/routes');
  assert.ok(routes.data.data.length >= 4);
  const buildings = await api('/api/v1/routes/campus-buildings');
  assert.strictEqual(buildings.data.type, 'FeatureCollection');
  assert.ok(buildings.data.features.length >= 8);
  ok('Routes + 3D campus buildings');

  // 5. Cross-driver authorization: driver-rajesh may not drive bus-02
  const forbidden = await api('/api/v1/trips/start', {
    method: 'POST',
    headers: { Authorization: `Bearer ${driver.token}` },
    body: JSON.stringify({ busId: 'bus-02', routeId: 'route-ynr-02' }),
  });
  assert.strictEqual(forbidden.status, 403);
  ok('Driver blocked from operating an unassigned vehicle (403)');

  // 6. Driver starts own trip (idempotent: recover from a leftover active trip
  //    if a previous run crashed before its end-lifecycle step).
  let started = await api('/api/v1/trips/start', {
    method: 'POST',
    headers: { Authorization: `Bearer ${driver.token}` },
    body: JSON.stringify({ busId: 'bus-01', routeId: 'route-amb-01' }),
  });
  if (started.status === 409) {
    const live = await api('/api/v1/fleet/live');
    const stale = live.data?.data?.find((b: any) => b.busId === 'bus-01');
    if (stale?.tripId) {
      await api(`/api/v1/trips/${stale.tripId}/end`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${driver.token}` },
        body: JSON.stringify({ endOdometerKm: 1 }),
      });
    }
    started = await api('/api/v1/trips/start', {
      method: 'POST',
      headers: { Authorization: `Bearer ${driver.token}` },
      body: JSON.stringify({ busId: 'bus-01', routeId: 'route-amb-01' }),
    });
  }
  assert.strictEqual(started.status, 201, JSON.stringify(started.data));
  const tripId = started.data.data.id;
  ok('Driver starts trip on assigned bus');

  // 7. Attendance with a real trip id, and rejection of unknown trip
  const attOk = await api('/api/v1/attendance/check-in', {
    method: 'POST',
    headers: { Authorization: `Bearer ${driver.token}` },
    body: JSON.stringify({ tripId, studentId: 'usr-student-01', stopId: 'stop-amb-01', status: 'BOARDED' }),
  });
  assert.strictEqual(attOk.status, 200, JSON.stringify(attOk.data));
  const attBad = await api('/api/v1/attendance/check-in', {
    method: 'POST',
    headers: { Authorization: `Bearer ${driver.token}` },
    body: JSON.stringify({ tripId: 'trip-does-not-exist', studentId: 'usr-student-01', stopId: 'stop-amb-01', status: 'BOARDED' }),
  });
  assert.strictEqual(attBad.status, 404);
  ok('Attendance persists for real trip; unknown trip rejected (404)');

  // 8. Anonymous WS cannot publish telemetry / subscribe radar / SOS
  {
    const ws = await openSocket(WS_URL);
    const errors: string[] = [];
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.event === 'ERROR') errors.push(m.data.message);
    });
    ws.send(JSON.stringify({ action: 'TELEMETRY_PING', payload: { busId: 'bus-01', latitude: 30.26, longitude: 77.0, speed: 999 } }));
    ws.send(JSON.stringify({ action: 'SUBSCRIBE', channel: 'admin:radar' }));
    ws.send(JSON.stringify({ action: 'EMERGENCY_SOS', payload: { busId: 'bus-04', message: 'FAKE' } }));
    await new Promise((r) => setTimeout(r, 900));
    ws.close();
    assert.strictEqual(errors.length, 3, `expected 3 auth errors, got: ${errors.join(', ')}`);
    ok('Anonymous WebSocket fully rejected (telemetry/subscribe/SOS)');
  }

  // 9. Authenticated driver telemetry flows to route channel with speed cap
  {
    const ws = await openSocket(`${WS_URL}?token=${encodeURIComponent(driver.token)}&routeId=route-amb-01`);
    const updatePromise = waitForEvent(ws, 'BUS_POSITION_UPDATE');
    await new Promise((r) => setTimeout(r, 200));
    ws.send(JSON.stringify({
      action: 'TELEMETRY_PING',
      payload: { tripId, busId: 'bus-01', routeId: 'route-amb-01', latitude: 30.30, longitude: 76.90, speed: 200, bearing: 120 },
    }));
    const update = await updatePromise;
    ws.close();
    assert.ok(update.data.speedKmh <= 160, `speed must be capped, got ${update.data.speedKmh}`);
    ok(`Authenticated telemetry broadcast with speed cap (${update.data.speedKmh} km/h)`);
  }

  // 10. Admin-only endpoint rejects a student token
  const studentAdmin = await api('/api/v1/admin/fleet-overview', {
    headers: { Authorization: `Bearer ${student.token}` },
  });
  assert.strictEqual(studentAdmin.status, 403);
  const adminOverview = await api('/api/v1/admin/fleet-overview', {
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  assert.strictEqual(adminOverview.status, 200);
  ok('Admin endpoints enforce RBAC (student 403 / admin 200)');

  // 11. Persistence check: trip survives a fresh read
  const manifest = await api(`/api/v1/trips/${tripId}/manifest`, {
    headers: { Authorization: `Bearer ${driver.token}` },
  });
  assert.strictEqual(manifest.status, 200);
  assert.ok(manifest.data.data.totalBoarded >= 1);
  ok('Trip + attendance persisted and readable (PostgreSQL)');

  // 12. Trip lifecycle ends cleanly
  const ended = await api(`/api/v1/trips/${tripId}/end`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${driver.token}` },
    body: JSON.stringify({}),
  });
  assert.strictEqual(ended.status, 200);
  assert.strictEqual(ended.data.data.status, 'COMPLETED');
  ok('Trip end lifecycle (COMPLETED)');

  console.log(`\n===== ALL ${passed} PRODUCTION TESTS PASSED =====`);
}

run().catch((err) => {
  console.error('\nTest failure:', err.message);
  process.exit(1);
});
