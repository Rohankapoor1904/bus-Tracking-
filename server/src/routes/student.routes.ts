import { Router, Request, Response } from 'express';
import { db } from '../db/database.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { calculateDistanceMeters, calculateETA } from '../db/spatial-engine.js';
import { config } from '../config/index.js';

export const studentRouter = Router();

studentRouter.get('/allocation', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const studentId = req.user?.userId;
    if (!studentId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const allocation = await db.getAllocationByStudentId(studentId);
    if (!allocation) {
      if (config.enableDemoAccounts) {
        // Development convenience: show an example allocation for unallocated demos.
        const defaultAllocation = (await db.getAllocationsByRouteId('route-amb-01'))[0];
        res.status(200).json({ success: true, data: defaultAllocation });
        return;
      }
      res.status(404).json({ success: false, error: 'No active bus allocation found for this student' });
      return;
    }

    const route = await db.getRouteById(allocation.routeId);
    const bus = allocation.busId ? await db.getBusById(allocation.busId) : null;
    const stop = route?.stops.find(s => s.id === allocation.assignedStopId);

    // Get live trip
    const activeTrip = bus ? await db.getActiveTripByBusId(bus.id) : null;
    const telemetry = bus ? await db.getLatestTelemetry(bus.id) : null;

    let distanceToStopMeters = 0;
    let etaMinutes = 0;
    let isWithinGeofence = false;

    if (telemetry && stop) {
      distanceToStopMeters = calculateDistanceMeters(
        telemetry.latitude,
        telemetry.longitude,
        stop.latitude,
        stop.longitude
      );
      etaMinutes = calculateETA(distanceToStopMeters, telemetry.speedKmh);
      isWithinGeofence = distanceToStopMeters <= config.geofenceRadiusMeters;
    }

    res.status(200).json({
      success: true,
      data: {
        allocation,
        route,
        stop,
        bus,
        liveTracking: {
          isTripActive: !!activeTrip,
          tripId: activeTrip?.id,
          currentCoordinates: telemetry ? [telemetry.longitude, telemetry.latitude] : [76.83756, 30.33268],
          // Parked contract: no active trip => zero motion, static terminal fix.
          speedKmh: activeTrip ? telemetry?.speedKmh || 0 : 0,
          bearing: telemetry?.bearing || 0,
          distanceToStopMeters: activeTrip ? Math.round(distanceToStopMeters) : 0,
          etaMinutes: activeTrip ? etaMinutes : 0,
          isWithinGeofence: activeTrip ? isWithinGeofence : false,
          lastPing: telemetry?.recordedAt || null,
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
