import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { userDb, User } from './database.js';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
      token?: string;
    }
  }
}

// JWT secret - in production this should be in environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'vigil-guard-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Generate JWT token
export function generateToken(user: User): string {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
  );
}

// Verify JWT token
export function verifyToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// Hash password
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// Compare password with hash
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Authentication middleware
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    // Check for token in various places
    let token = req.headers.authorization?.split(' ')[1]; // Bearer token
    if (!token) {
      token = req.cookies?.token; // Cookie
    }
    if (!token) {
      token = req.body?.token || req.query?.token; // Body or query param
    }

    if (!token) {
      return res.status(401).json({ error: 'No authentication token provided' });
    }

    // Verify token
    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Check if session exists in database
    const session = userDb.getSessionByToken(token);
    if (!session) {
      return res.status(401).json({ error: 'Session not found or expired' });
    }

    // Get user from database
    const user = userDb.getUserById(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    // Attach user and token to request
    req.user = user;
    req.token = token;

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

// Authorization middleware - check if user has required role
export function authorize(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

// Optional authentication - doesn't fail if no token, just doesn't set user
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  try {
    let token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      token = req.cookies?.token;
    }

    if (token) {
      const decoded = verifyToken(token);
      if (decoded) {
        const session = userDb.getSessionByToken(token);
        if (session) {
          const user = userDb.getUserById(decoded.id);
          if (user && user.is_active) {
            req.user = user;
            req.token = token;
          }
        }
      }
    }
  } catch (error) {
    // Silently continue without auth
  }

  next();
}

// Alias for authenticate (used by userRoutes)
export const authenticateToken = authenticate;

// Permission-based middleware
export function requireMonitoringAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (!req.user.can_view_monitoring) {
    return res.status(403).json({ error: 'Access denied. Monitoring permission required.' });
  }

  next();
}

export function requireConfigurationAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (!req.user.can_view_configuration) {
    return res.status(403).json({ error: 'Access denied. Configuration permission required.' });
  }

  next();
}

export function requireUserManagementAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (!req.user.can_manage_users) {
    return res.status(403).json({ error: 'Access denied. User management permission required.' });
  }

  next();
}