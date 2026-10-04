import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const isProd = process.env.NODE_ENV === 'production';

function required(name: string, fallbackForDev?: string): string {
  const value = process.env[name];
  if (value && value.length > 0) return value;
  if (!isProd && fallbackForDev !== undefined) return fallbackForDev;
  throw new Error(
    `[Config] Missing required environment variable ${name}. ` +
      `Set it before starting the server in production.`
  );
}

const jwtSecret = required('JWT_SECRET', 'dev-only-insecure-secret-do-not-use-in-production');

if (isProd) {
  if (jwtSecret.length < 32) {
    throw new Error('[Config] JWT_SECRET must be at least 32 characters in production.');
  }
  if (!process.env.CORS_ORIGIN || process.env.CORS_ORIGIN === '*') {
    console.warn(
      '[Config] CORS_ORIGIN is not restricted. Set CORS_ORIGIN to a comma-separated allowlist in production.'
    );
  }
}

export const config = {
  isProd,
  port: parseInt(process.env.PORT || '4000', 10),
  host: process.env.HOST || '0.0.0.0',
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  databaseUrl: required('DATABASE_URL', 'postgres://mmu:mmu_secret@127.0.0.1:5432/mmu_fleet'),
  redisUrl: process.env.REDIS_URL || '',
  corsOrigin: process.env.CORS_ORIGIN || '',
  /**
   * Express `trust proxy` setting. Set to the number of trusted proxy hops
   * (e.g. `1` behind a single nginx/cloud LB) so `req.ip` and the rate limiter
   * key on the real client address. Left disabled by default.
   */
  trustProxy: process.env.TRUST_PROXY ? (isNaN(Number(process.env.TRUST_PROXY)) ? process.env.TRUST_PROXY : Number(process.env.TRUST_PROXY)) : false,
  geofenceRadiusMeters: parseInt(process.env.GEOFENCE_RADIUS_METERS || '1000', 10),
  speedLimitKmh: parseFloat(process.env.SPEED_LIMIT_KMH || '75.0'),
  telemetryIngestionRateHz: parseFloat(process.env.TELEMETRY_INGESTION_HZ || '2'),
  maxTelemetrySpeedKmh: parseFloat(process.env.MAX_TELEMETRY_SPEED_KMH || '160'),
  telemetryBBox: {
    minLat: parseFloat(process.env.TELEMETRY_MIN_LAT || '29.8'),
    maxLat: parseFloat(process.env.TELEMETRY_MAX_LAT || '30.9'),
    minLng: parseFloat(process.env.TELEMETRY_MIN_LNG || '76.2'),
    maxLng: parseFloat(process.env.TELEMETRY_MAX_LNG || '77.7'),
  },
  /**
   * Demo credentials are a development convenience only. In production the
   * public demo-account endpoint and the built-in personas are disabled.
   */
  enableDemoAccounts: process.env.ENABLE_DEMO_ACCOUNTS
    ? process.env.ENABLE_DEMO_ACCOUNTS === 'true'
    : !isProd,
  demoPassword: process.env.DEMO_PASSWORD || 'MMU@Secure2026',
};
