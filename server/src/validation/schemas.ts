import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(200),
  role: z.enum(['STUDENT', 'DRIVER', 'ADMIN', 'DISPATCHER']).optional(),
});

export const startTripSchema = z.object({
  busId: z.string().min(1).max(64),
  routeId: z.string().min(1).max(64),
  direction: z.enum(['CAMPUS_BOUND', 'RETURN_BOUND']).optional(),
  startOdometerKm: z.number().nonnegative().max(2_000_000).optional(),
});

export const endTripSchema = z.object({
  endOdometerKm: z.number().nonnegative().max(2_000_000).optional(),
});

export const attendanceSchema = z.object({
  tripId: z.string().min(1).max(64),
  studentId: z.string().min(1).max(64),
  stopId: z.string().min(1).max(64),
  status: z.enum(['PENDING', 'BOARDED', 'ABSENT', 'EXCUSED']),
  verificationMethod: z.enum(['MANUAL_CONSOLE', 'NFC_RFID', 'QR_CODE']).optional(),
});

export const busStatusSchema = z.object({
  status: z
    .enum(['IDLE', 'EN_ROUTE', 'ARRIVED_CAMPUS', 'MAINTENANCE', 'OFFLINE'])
    .optional(),
  driverId: z.string().min(1).max(64).optional(),
});

/**
 * Telemetry payload schema. Coordinates are globally bounded and the speed is
 * capped at a hard physical ceiling so a malformed or spoofed packet cannot
 * inject absurd fleet state.
 */
export const telemetryPayloadSchema = z
  .object({
    tripId: z.string().max(64).optional(),
    busId: z.string().min(1).max(64),
    routeId: z.string().max(64).optional(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    speed: z.number().min(0).max(400).optional(),
    speedKmh: z.number().min(0).max(400).optional(),
    bearing: z.number().min(0).max(360).optional(),
    altitude: z.number().min(-500).max(9000).optional(),
    altitudeM: z.number().min(-500).max(9000).optional(),
    accuracy: z.number().min(0).max(10000).optional(),
    accuracyM: z.number().min(0).max(10000).optional(),
    batteryLevel: z.number().min(0).max(100).optional(),
    batteryPercent: z.number().min(0).max(100).optional(),
    timestamp: z.union([z.number(), z.string()]).optional(),
  })
  .passthrough();

export const sosSchema = z.object({
  busId: z.string().min(1).max(64),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  message: z.string().max(500).optional(),
});
