import { Router, Request, Response } from 'express';
import { db } from '../db/database.js';
import { authenticate, requireRole, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { attendanceSchema } from '../validation/schemas.js';

export const attendanceRouter = Router();

attendanceRouter.post(
  '/check-in',
  authenticate,
  requireRole('DRIVER', 'ADMIN'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const parsed = attendanceSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'tripId, studentId, stopId, and status (BOARDED | ABSENT | PENDING) are required',
        });
        return;
      }

      const trip = await db.getTripSessionById(parsed.data.tripId);
      if (!trip) {
        res.status(404).json({ success: false, error: 'Trip not found' });
        return;
      }
      if (req.user?.role === 'DRIVER' && trip.driverId !== req.user.userId) {
        res.status(403).json({ success: false, error: 'Not authorized to manage this trip manifest' });
        return;
      }

      const record = await db.upsertAttendanceRecord({
        ...parsed.data,
        verificationMethod: parsed.data.verificationMethod || 'MANUAL_CONSOLE',
      });

      res.status(200).json({ success: true, data: record });
    } catch (err: any) {
      const notFound = /not found/i.test(err.message);
      res.status(notFound ? 404 : 500).json({ success: false, error: err.message });
    }
  }
);

attendanceRouter.get('/trip/:tripId', authenticate, async (req: Request<{ tripId: string }>, res: Response): Promise<void> => {
  try {
    const trip = await db.getTripSessionById(req.params.tripId);
    if (!trip) {
      res.status(404).json({ success: false, error: 'Trip not found' });
      return;
    }
    const records = await db.getAttendanceLogs(req.params.tripId);
    res.status(200).json({ success: true, data: records });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
