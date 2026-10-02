import { Router, Request, Response } from 'express';
import { db } from '../db/database.js';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';

export const adminRouter = Router();

adminRouter.get('/fleet-overview', authenticate, requireRole('ADMIN'), async (_req: Request, res: Response): Promise<void> => {
  try {
    const metrics = await db.getAdminFleetMetrics();
    res.status(200).json({ success: true, data: metrics });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

adminRouter.get('/manifest-breakdown', authenticate, requireRole('ADMIN'), async (_req: Request, res: Response): Promise<void> => {
  try {
    const routes = await db.getAllRoutes();
    const breakdown = await Promise.all(
      routes.map(async (r) => {
        const allocations = await db.getAllocationsByRouteId(r.id);
        const activeTrip = await db.getActiveTripByRouteId(r.id);
        const attendanceLogs = activeTrip ? await db.getAttendanceLogs(activeTrip.id) : [];

        const stopBreakdown = r.stops.map((s) => {
          const stopAllocations = allocations.filter((a) => a.assignedStopId === s.id);
          const boarded = attendanceLogs.filter((l) => l.stopId === s.id && l.status === 'BOARDED').length;
          return {
            stopId: s.id,
            stopName: s.name,
            sequence: s.stopSequence,
            enrolledCount: stopAllocations.length,
            boardedCount: boarded,
            pendingCount: Math.max(0, stopAllocations.length - boarded),
          };
        });

        return {
          routeId: r.id,
          routeName: r.name,
          routeCode: r.routeCode,
          campus: r.campus,
          totalEnrolled: allocations.length,
          activeTripId: activeTrip?.id || null,
          totalBoarded: activeTrip?.totalPassengersBoarded || 0,
          stops: stopBreakdown,
        };
      })
    );

    res.status(200).json({ success: true, data: breakdown });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

adminRouter.get('/alerts', authenticate, requireRole('ADMIN'), async (_req: Request, res: Response): Promise<void> => {
  try {
    const alerts = await db.getActiveAlerts();
    res.status(200).json({ success: true, data: alerts });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

adminRouter.post('/alerts/:id/resolve', authenticate, requireRole('ADMIN'), async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const success = await db.resolveAlert(req.params.id);
    if (!success) {
      res.status(404).json({ success: false, error: 'Alert not found' });
      return;
    }
    res.status(200).json({ success: true, message: 'Alert resolved successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
