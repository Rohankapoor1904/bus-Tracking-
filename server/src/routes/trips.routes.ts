import { Router, Request, Response } from 'express';
import { db } from '../db/database.js';
import { authenticate, requireRole, AuthenticatedRequest } from '../middleware/auth.middleware.js';

export const tripsRouter = Router();

tripsRouter.post('/start', authenticate, requireRole('DRIVER', 'ADMIN'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { busId, routeId, direction, startOdometerKm } = req.body;
    if (!busId || !routeId) {
      res.status(400).json({ success: false, error: 'busId and routeId are required' });
      return;
    }

    const driverId = req.user?.userId || 'usr-driver-01';
    const trip = await db.createTripSession({
      busId,
      routeId,
      driverId,
      direction: direction || 'CAMPUS_BOUND',
      startOdometerKm,
    });

    res.status(201).json({ success: true, data: trip });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

tripsRouter.post('/:id/end', authenticate, requireRole('DRIVER', 'ADMIN'), async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { endOdometerKm } = req.body;
    const trip = await db.updateTripSession(req.params.id, {
      status: 'COMPLETED',
      endedAt: new Date().toISOString(),
      ...(endOdometerKm ? { endOdometerKm } : {}),
    });

    if (!trip) {
      res.status(404).json({ success: false, error: 'Trip not found' });
      return;
    }

    // Return bus status to IDLE
    await db.updateBus(trip.busId, { status: 'IDLE' });

    res.status(200).json({ success: true, data: trip });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

tripsRouter.get('/:id/manifest', authenticate, async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const trip = await db.getTripSessionById(req.params.id);
    if (!trip) {
      res.status(404).json({ success: false, error: 'Trip not found' });
      return;
    }

    const route = await db.getRouteById(trip.routeId);
    const allocations = await db.getAllocationsByRouteId(trip.routeId);
    const attendanceLogs = await db.getAttendanceLogs(trip.id);

    // Group allocations by stop
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
