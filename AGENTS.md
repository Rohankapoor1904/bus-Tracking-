# AGENTS.md — MMU FleetRadar 3D

Real-time university bus tracking for MMU Mullana. Students track buses, admins
track students + drivers. **Positions must always be authentic — never fabricate
coordinates.**

## Layout

- `server/` — Express + WebSocket API. PostgreSQL/PostGIS persistence
  (`src/db/`), Redis geo cache with graceful fallback, zod validation,
  helmet/rate-limit/CORS hardening.
- `client/` — React + Vite + MapLibre GL. `src/components/{admin,student,driver,3d}`,
  `src/services/{api,websocket,offlineQueue}`.

## Commands

Server (run from `server/`):
- `npm run dev` — tsx watch on `PORT` (default 4000)
- `npm run build` — `tsc` + copy `schema.sql` to `dist/`
- `npm test` — production verification suite (`test/integration.test.ts`); needs
  PostgreSQL (`mmu_fleet`) + Redis. Idempotent: recovers from a leftover active trip.

Client (run from `client/`):
- `npm run dev` — Vite dev server (default 5173)
- `npx tsc -b --noEmit` — typecheck
- `npm run build` — production bundle
- `npm test` — vitest unit tests (e.g. telemetry health thresholds)

## Container / deployment

- `docker compose up -d --build` builds `server/Dockerfile` + `client/Dockerfile`
  (build context = repo root) and serves the SPA on `:8080` with nginx proxying
  `/api` + `/ws` to the backend (single origin).
- `docker compose up -d postgres redis` is enough for local dev against the API.
- Root `.env` (from `.env.example`) supplies `JWT_SECRET` to compose.

## Conventions / gotchas

- Coordinates are `number | null`. A bus without a GPS fix reports `null`, and
  the UI shows "No GPS fix" and skips its marker — do not reintroduce a default
  campus coordinate.
- WebSocket telemetry/attendance/SOS require an authenticated `DRIVER`/`ADMIN`.
- Driver may only operate their own assigned vehicle (else 403).
- Demo accounts / auto-login are DEV-only (`import.meta.env.DEV` on client,
  `config.enableDemoAccounts` on server). Never ship the demo password in prod.
- Map basemap: OpenFreeMap by default; Ola Maps opt-in via `VITE_MAP_PROVIDER=ola`
  + `VITE_OLA_MAPS_API_KEY`. Do not use Google raster tile endpoints.
- Vite dev is exposed through container host `work-1-*` (port 12000); point the
  client at the API with `localStorage.mmu_server_host` (e.g. the `work-2-*` host).
