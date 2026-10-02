import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  host: process.env.HOST || '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET || 'mmu-fleet-radar-super-secret-jwt-key-2026-secure',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  databaseUrl: process.env.DATABASE_URL || '',
  redisUrl: process.env.REDIS_URL || '',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  geofenceRadiusMeters: parseInt(process.env.GEOFENCE_RADIUS_METERS || '1000', 10),
  speedLimitKmh: parseFloat(process.env.SPEED_LIMIT_KMH || '75.0'),
  telemetryIngestionRateHz: 2,
};
