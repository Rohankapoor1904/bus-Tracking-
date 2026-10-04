import { Router, Request, Response } from 'express';
import { db } from '../db/database.js';
import { authenticate, requireRole, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { startTripSchema, endTripSchema } from '../validation/schemas.js';

export const tripsRouter = Router();

tripsRouter.post(
  '/start',
  authenticate,
  requireRole('DRIVER', 'ADMIN'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const parsed = startTripSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: 'busId and routeId are required' });
        return;
      }

      const bus = await db.getBusById(parsed.data.busId);
      if (!bus) {
        res.status(404).json({ success: false, error: 'Bus not found' });
        return;
      }
      const route = await db.getRouteById(parsed.data.routeId);
      if (!route) {
        res.status(404).json({ success: false, error: 'Route not found' });
        return;
      }

      // A driver may only start a trip for their own assigned vehicle.
      if (req.user?.role === 'DRIVER' && req.user.userId) {
        const user = await db.getUserById(req.user.userId);
        if (!user?.assignedBusId || user.assignedBusId !== parsed.data.busId) {
          res.status(403).json({ success: false, error: 'Not authorized to operate this vehicle' });
          return;
        }
      }

      const existing = await db.getActiveTripByBusId(parsed.data.busId);
      if (existing) {
        res.status(409).json({ success: false, error: 'A trip is already active for this bus' });
        return;
      }

      const trip = await db.createTripSession({
        busId: parsed.data.busId,
        routeId: parsed.data.routeId,
        driverId: req.user!.userId,
        direction: parsed.data.direction || 'CAMPUS_BOUND',
        startOdometerKm: parsed.data.startOdometerKm,
      });

      res.status(201).json({ success: true, data: trip });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

tripsRouter.post(
  '/:id/end',
  authenticate,
  requireRole('DRIVER', 'ADMIN'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const parsed = endTripSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ success: false, error: 'Invalid end-trip payload' });
        return;
      }

      const existing = await db.getTripSessionById(String(req.params.id));
      if (!existing) {
        res.status(404).json({ success: false, error: 'Trip not found' });
        return;
      }

      if (req.user?.role === 'DRIVER' && existing.driverId !== req.user.userId) {
        res.status(403).json({ success: false, error: 'Not authorized to end this trip' });
        return;
      }

      const trip = await db.updateTripSession(String(req.params.id), {
        status: 'COMPLETED',
        endedAt: new Date().toISOString(),
        ...(parsed.data.endOdometerKm ? { endOdometerKm: parsed.data.endOdometerKm } : {}),
      });

      await db.updateBus(existing.busId, { status: 'IDLE' });

      res.status(200).json({ success: true, data: trip });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

tripsRouter.get('/:id/manifest', authenticate, async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const trip = await db.getTripSessionById(String(req.params.id));
    if (!trip) {
      res.status(404).json({ success: false, error: 'Trip not found' });
      return;
    }

    const route = await db.getRouteById(trip.routeId);
    const allocations = await db.getAllocationsByRouteId(trip.routeId);
    const attendanceLogs = await db.getAttendanceLogs(trip.id);

    const stopsManifest = (route?.stops || []).map((stop) => {
      const stopAllocations = allocations.filter((a) => a.assignedStopId === stop.id);
      const studentList = stopAllocations.map((a) => {
        const log = attendanceLogs.find((l) => l.studentId === a.studentId);
        return {
          studentId: a.studentId,
          studentName: a.studentName || 'Student',
          rollNumber: a.studentRoll || 'N/A',
          department: a.department || 'Student',
          phone: a.phone || '',
          passNumber: a.passNumber,
          status: log?.status || 'PENDING',
          scannedAt: log?.scannedAt || null,
        };
      });

      return {
        stopId: stop.id,
        stopName: stop.name,
        stopSequence: stop.stopSequence,
        landmark: stop.landmark,
        latitude: stop.latitude,
        longitude: stop.longitude,
        totalEnrolled: stopAllocations.length,
        boardedCount: studentList.filter((s) => s.status === 'BOARDED').length,
        students: studentList,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        trip,
        route,
        totalEnrolledStudents: allocations.length,
        totalBoarded: trip.totalPassengersBoarded,
        stopsManifest,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
