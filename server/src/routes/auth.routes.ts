import { Router, Request, Response } from 'express';
import { AuthService } from '../services/auth.service.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { db } from '../db/database.js';

export const authRouter = Router();

authRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, role } = req.body;
    if (!email || !password) {
      res.status(400).json({ success: false, error: 'Email and password are required' });
      return;
    }

    const result = await AuthService.login(email, password, role);
    res.status(200).json({ success: true, data: result });
  } catch (err: any) {
    res.status(401).json({ success: false, error: err.message || 'Login failed' });
  }
});

authRouter.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }
    const user = await db.getUserById(req.user.userId);
    if (!user) {
      res.status(404).json({ success: false, error: 'User record not found' });
      return;
    }
    const sanitized = { ...user };
    delete sanitized.passwordHash;
    res.status(200).json({ success: true, data: sanitized });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

authRouter.get('/demo-accounts', async (_req: Request, res: Response): Promise<void> => {
  // Returns demo accounts list for one-click instant testing
  const users = await db.getAllUsers();
  const demoList = users.map(u => ({
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    identifier: u.identifier,
    department: u.department,
    assignedBusId: u.assignedBusId,
    assignedRouteId: u.assignedRouteId,
  }));
  res.status(200).json({
    success: true,
    data: {
      defaultPassword: 'MMU@Secure2026',
      accounts: demoList,
    },
  });
});
