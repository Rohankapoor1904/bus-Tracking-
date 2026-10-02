import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from '../db/database.js';
import { config } from '../config/index.js';
import { User, UserRole } from '../types/index.js';

export interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  fullName: string;
  identifier: string;
}

export class AuthService {
  public static async login(email: string, password: string, requestedRole?: UserRole): Promise<{ token: string; user: User }> {
    const user = await db.getUserByEmail(email);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    if (!user.isActive) {
      throw new Error('Account is suspended. Please contact MMU Fleet Dispatch.');
    }

    if (requestedRole && user.role !== requestedRole && user.role !== 'ADMIN') {
      throw new Error(`Account does not have ${requestedRole} privileges`);
    }

    const isValidPassword = user.passwordHash
      ? await bcrypt.compare(password, user.passwordHash)
      : false;

    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
      identifier: user.identifier,
    };

    const token = jwt.sign(payload, config.jwtSecret, {
      expiresIn: '24h',
    });

    const sanitizedUser = { ...user };
    delete sanitizedUser.passwordHash;

    return { token, user: sanitizedUser };
  }

  public static verifyToken(token: string): TokenPayload {
    try {
      return jwt.verify(token, config.jwtSecret) as TokenPayload;
    } catch {
      throw new Error('Invalid or expired authentication token');
    }
  }
}
