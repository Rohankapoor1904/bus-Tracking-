import { Request, Response, NextFunction } from 'express';
import { AuthService, TokenPayload } from '../services/auth.service.js';
import { UserRole } from '../types/index.js';

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: 'Missing or malformed Authorization header. Bearer token required.',
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = AuthService.verifyToken(token);
    req.user = payload;
    next();
  } catch (err: any) {
    res.status(401).json({
      success: false,
      error: err.message || 'Unauthorized token',
    });
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    if (!allowedRoles.includes(req.user.role) && req.user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        error: `Forbidden: requires one of [${allowedRoles.join(', ')}]`,
      });
      return;
    }

    next();
  };
}
