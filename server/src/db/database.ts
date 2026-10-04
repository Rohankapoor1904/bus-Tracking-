import { PostgresFleetRepository } from './postgres-repository.js';
import type { FleetRepository } from './repository.js';

/**
 * Process-wide persistence singleton backed by PostgreSQL + PostGIS.
 * All fleet state (users, routes, trips, telemetry, attendance, alerts)
 * lives in the database, so it survives restarts and scales horizontally.
 */
export const db: FleetRepository = new PostgresFleetRepository();

export type { FleetRepository };
