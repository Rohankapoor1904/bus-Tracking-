import { Router, Request, Response } from 'express';
import { AuthService } from '../services/auth.service.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { db } from '../db/database.js';
import { config } from '../config/index.js';
import { loginSchema } from '../validation/schemas.js';
import { User } from '../types/index.js';

export const authRouter = Router();

authRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Email and password are required' });
      return;
    }

    const result = await AuthService.login(parsed.data.email, parsed.data.password, parsed.data.role);
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
    const sanitized: User & { isGlobalAccess?: boolean } = {
      ...user,
      isGlobalAccess: req.user.isGlobalAccess === true,
    };
    delete sanitized.passwordHash;
    res.status(200).json({ success: true, data: sanitized });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Development-only persona switcher feed. Disabled in production unless
 * explicitly enabled, because it exposes the shared demo password.
 */
authRouter.get('/demo-accounts', async (_req: Request, res: Response): Promise<void> => {
  if (!config.enableDemoAccounts) {
    res.status(404).json({ success: false, error: 'Not available' });
    return;
  }
  const users = await db.getAllUsers();
  const demoList = users.map((u) => ({
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
      defaultPassword: config.demoPassword,
      accounts: demoList,
    },
  });
});
