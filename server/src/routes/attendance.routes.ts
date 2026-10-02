import { Router, Request, Response } from 'express';
import { db } from '../db/database.js';
import { authenticate, requireRole, AuthenticatedRequest } from '../middleware/auth.middleware.js';

export const attendanceRouter = Router();

attendanceRouter.post('/check-in', authenticate, requireRole('DRIVER', 'ADMIN'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { tripId, studentId, stopId, status, verificationMethod } = req.body;
    if (!tripId || !studentId || !stopId || !status) {
      res.status(400).json({
        success: false,
        error: 'tripId, studentId, stopId, and status (BOARDED | ABSENT | PENDING) are required',
      });
      return;
    }

    const record = await db.upsertAttendanceRecord({
      tripId,
      studentId,
      stopId,
      status,
      verificationMethod: verificationMethod || 'MANUAL_CONSOLE',
    });

    res.status(200).json({ success: true, data: record });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

attendanceRouter.get('/trip/:tripId', authenticate, async (req: Request<{ tripId: string }>, res: Response): Promise<void> => {
  try {
    const records = await db.getAttendanceLogs(req.params.tripId);
    res.status(200).json({ success: true, data: records });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
