import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/index.js';
import { db } from './db/database.js';
import { redis } from './db/redis.js';
import { authRouter } from './routes/auth.routes.js';
import { routesRouter } from './routes/routes.routes.js';
import { fleetRouter } from './routes/fleet.routes.js';
import { tripsRouter } from './routes/trips.routes.js';
import { attendanceRouter } from './routes/attendance.routes.js';
import { studentRouter } from './routes/student.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { WebSocketGateway } from './websocket/gateway.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

app.use(helmet());

const corsOrigins = config.corsOrigin
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: corsOrigins.length > 0 ? corsOrigins : config.isProd ? false : true,
    credentials: true,
  })
);

app.use(express.json({ limit: '256kb' }));

// Throttle authentication attempts to blunt credential stuffing.
const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please try again shortly.' },
});
app.use('/api/v1/auth/login', authLimiter);

// Serve static branding assets (MMU logos, crests)
const assetsPath = path.resolve(__dirname, '../../assets/branding');
app.use('/assets/branding', express.static(assetsPath));

// Healthcheck (also reports downstream readiness)
app.get('/health', async (_req, res) => {
  let dbOk = false;
  try {
    dbOk = true;
    await db.getAllBuses();
  } catch {
    dbOk = false;
  }
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'HEALTHY' : 'DEGRADED',
    system: 'MMU Real-Time 3D Bus Tracking Telemetry System',
    database: dbOk ? 'UP' : 'DOWN',
    redis: redis.isAvailable() ? 'UP' : 'DISABLED',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/routes', routesRouter);
app.use('/api/v1/buses', fleetRouter);
app.use('/api/v1/trips', tripsRouter);
app.use('/api/v1/attendance', attendanceRouter);
app.use('/api/v1/student', studentRouter);
app.use('/api/v1/admin', adminRouter);

// 404
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

// Central error handler (never leak internals)
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[HTTP] Unhandled error:', err?.message || err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

async function bootstrap() {
  await db.init();
  await redis.init();

  const wsGateway = new WebSocketGateway(server);

  server.listen(config.port, config.host, () => {
    console.log(`================================================================`);
    console.log(`  MAHARISHI MARKANDESHWAR UNIVERSITY (MMU) FLEETRADAR 3D        `);
    console.log(`  Telemetry Gateway & REST API Server Running                   `);
    console.log(`----------------------------------------------------------------`);
    console.log(`  Base REST URL:    http://${config.host}:${config.port}/api/v1  `);
    console.log(`  WebSocket URL:    ws://${config.host}:${config.port}/ws        `);
    console.log(`  Health Check:     http://${config.host}:${config.port}/health  `);
    console.log(`  Mode:             ${config.isProd ? 'PRODUCTION' : 'DEVELOPMENT'} `);
    console.log(`================================================================`);
  });

  const shutdown = async () => {
    console.log('Shutting down MMU Fleet Server gracefully...');
    wsGateway.destroy();
    server.close(async () => {
      await redis.close().catch(() => undefined);
      await db.close().catch(() => undefined);
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap().catch((err) => {
  console.error('[Boot] Fatal startup error:', err);
  process.exit(1);
});
