import { Router, Request, Response } from 'express';
import { db } from '../db/database.js';
import { authenticate, requireRole, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { startTripSchema, endTripSchema } from '../validation/schemas.js';
import { config } from '../config/index.js';
import { WebSocketGateway } from '../websocket/gateway.js';

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
      if (req.user?.role === 'DRIVER' && req.user.userId && !req.user.userId.includes('global')) {
        const user = await db.getUserById(req.user.userId);
        if (user?.assignedBusId && user.assignedBusId !== parsed.data.busId) {
          res.status(403).json({ success: false, error: 'Not authorized to operate this vehicle' });
          return;
        }
      }

      const existing = await db.getActiveTripByBusId(parsed.data.busId);
      if (existing) {
        // Reuse or refresh active trip so user is never locked out
        await db.updateBus(parsed.data.busId, { status: 'EN_ROUTE', defaultRouteId: parsed.data.routeId });
        WebSocketGateway.getInstance()?.broadcastToAll({
          event: 'TRIP_STARTED',
          timestamp: new Date().toISOString(),
          data: existing,
        });
        res.status(200).json({ success: true, data: existing });
        return;
      }

      const trip = await db.createTripSession({
        busId: parsed.data.busId,
        routeId: parsed.data.routeId,
        driverId: req.user!.userId,
        direction: parsed.data.direction || 'CAMPUS_BOUND',
        startOdometerKm: parsed.data.startOdometerKm,
      });

      await db.updateBus(parsed.data.busId, { status: 'EN_ROUTE', defaultRouteId: parsed.data.routeId });

      WebSocketGateway.getInstance()?.broadcastToAll({
        event: 'TRIP_STARTED',
        timestamp: new Date().toISOString(),
        data: trip,
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

      if (req.user?.role === 'DRIVER' && existing.driverId !== req.user.userId && !req.user.userId.includes('global')) {
        res.status(403).json({ success: false, error: 'Not authorized to end this trip' });
        return;
      }

      const trip = await db.updateTripSession(String(req.params.id), {
        status: 'COMPLETED',
        endedAt: new Date().toISOString(),
        ...(parsed.data.endOdometerKm ? { endOdometerKm: parsed.data.endOdometerKm } : {}),
      });

      await db.updateBus(existing.busId, { status: 'IDLE' });

      WebSocketGateway.getInstance()?.broadcastToAll({
        event: 'TRIP_ENDED',
        timestamp: new Date().toISOString(),
        data: { tripId: existing.id, busId: existing.busId },
      });

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
