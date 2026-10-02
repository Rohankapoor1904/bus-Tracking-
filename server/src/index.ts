import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/index.js';
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

// CORS configuration
app.use(
  cors({
    origin: config.corsOrigin === '*' ? true : config.corsOrigin,
    credentials: true,
  })
);

app.use(express.json());

// Serve static branding assets (MMU logos, crests)
const assetsPath = path.resolve(__dirname, '../../assets/branding');
app.use('/assets/branding', express.static(assetsPath));

// Healthcheck
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'HEALTHY',
    system: 'MMU Real-Time 3D Bus Tracking Telemetry System',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API Routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/routes', routesRouter);
app.use('/api/v1/buses', fleetRouter);
app.use('/api/v1/trips', tripsRouter);
app.use('/api/v1/attendance', attendanceRouter);
app.use('/api/v1/student', studentRouter);
app.use('/api/v1/admin', adminRouter);

// Initialize WebSocket Telemetry Gateway
const wsGateway = new WebSocketGateway(server);

server.listen(config.port, config.host, () => {
  console.log(`================================================================`);
  console.log(`  MAHARISHI MARKANDESHWAR UNIVERSITY (MMU) FLEETRADAR 3D        `);
  console.log(`  Telemetry Gateway & REST API Server Running                   `);
  console.log(`----------------------------------------------------------------`);
  console.log(`  Base REST URL:    http://${config.host}:${config.port}/api/v1  `);
  console.log(`  WebSocket URL:    ws://${config.host}:${config.port}/ws        `);
  console.log(`  Health Check:     http://${config.host}:${config.port}/health  `);
  console.log(`  Branding Assets:  http://${config.host}:${config.port}/assets/branding `);
  console.log(`================================================================`);
});

// Graceful termination
const shutdown = () => {
  console.log('Shutting down MMU Fleet Server gracefully...');
  wsGateway.destroy();
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
