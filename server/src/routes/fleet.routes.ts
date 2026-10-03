import { Router, Request, Response } from 'express';
import { db } from '../db/database.js';
import { authenticate, requireRole, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { busStatusSchema } from '../validation/schemas.js';

export const fleetRouter = Router();

fleetRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const buses = await db.getAllBuses();
    res.status(200).json({ success: true, data: buses });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

fleetRouter.get('/live', async (_req: Request, res: Response): Promise<void> => {
  try {
    const buses = await db.getAllBuses();
    const liveStates = await Promise.all(
      buses.map(async (b) => {
        const telemetry = await db.getLatestTelemetry(b.id);
        const trip = await db.getActiveTripByBusId(b.id);
        // Parked contract: no active trip OR bus not EN_ROUTE => STATIC,
        // zero motion, parked badge. Never replay stale speed.
        const parked = !trip || b.status !== 'EN_ROUTE';
        return {
          busId: b.id,
          busNumber: b.busNumber,
          registrationNumber: b.registrationNumber,
          model: b.model,
          status: parked ? 'IDLE' : b.status,
          capacity: b.capacity,
          boardedCount: trip?.totalPassengersBoarded || 0,
          driverName: b.assignedDriverName || 'Driver',
          driverPhone: b.assignedDriverPhone || '',
          routeId: b.defaultRouteId,
          routeName: b.defaultRouteName,
          tripId: trip?.id,
          latitude: telemetry?.latitude ?? 30.25045,
          longitude: telemetry?.longitude ?? 77.04505,
          speedKmh: parked ? 0 : telemetry?.speedKmh || 0,
          bearing: telemetry?.bearing || 0,
          altitudeM: telemetry?.altitudeM || 265,
          accuracyM: telemetry?.accuracyM || 3.0,
          lastPing: telemetry?.recordedAt || new Date().toISOString(),
          upcomingStopName: trip?.nextStopName || 'Bus Parked at Terminal',
          distanceToNextStopMeters: trip?.distanceToNextStopMeters || 0,
          etaMinutesUpcomingStop: trip?.etaMinutesToNextStop || 0,
        };
      })
    );

    res.status(200).json({ success: true, data: liveStates });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

fleetRouter.get('/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const bus = await db.getBusById(req.params.id);
    if (!bus) {
      res.status(404).json({ success: false, error: 'Bus not found' });
      return;
    }
    const telemetry = await db.getLatestTelemetry(bus.id);
    const trip = await db.getActiveTripByBusId(bus.id);

    res.status(200).json({
      success: true,
      data: {
        ...bus,
        currentTrip: trip,
        liveTelemetry: telemetry,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

fleetRouter.patch(
  '/:id/status',
  authenticate,
  requireRole('ADMIN', 'DRIVER'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const parsed = busStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: 'Invalid status payload' });
        return;
      }

      // Drivers may only change the status of their own assigned vehicle and
      // may not reassign drivers.
      if (req.user?.role === 'DRIVER') {
        const user = await db.getUserById(req.user.userId);
        if (!user?.assignedBusId || user.assignedBusId !== String(req.params.id)) {
          res.status(403).json({ success: false, error: 'Not authorized for this vehicle' });
          return;
        }
      }

      const bus = await db.updateBus(String(req.params.id), {
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
        ...(req.user?.role === 'ADMIN' && parsed.data.driverId
          ? { assignedDriverId: parsed.data.driverId }
          : {}),
      });
      if (!bus) {
        res.status(404).json({ success: false, error: 'Bus not found' });
        return;
      }
      res.status(200).json({ success: true, data: bus });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);
