import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import type { RequestUser } from '../utils/jwt';
import { ApiError } from '../utils/ApiError';
import { prisma } from '../lib/prisma';

export type { RequestUser };

export const authenticate = async (req: Request & { user?: RequestUser }, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError(401, 'Unauthorized: No token provided');
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true, isActive: true, deletedAt: true },
    });

    if (!user || user.deletedAt) {
      throw new ApiError(401, 'Unauthorized: User not found');
    }

    if (!user.isActive) {
      throw new ApiError(403, 'Account is deactivated');
    }

    req.user = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else {
      next(new ApiError(401, 'Invalid or expired token'));
    }
  }
};

export const authorize = (...allowedRoles: ('CUSTOMER' | 'TECHNICIAN' | 'MANAGER' | 'ADMIN')[]) => {
  return (req: Request & { user?: RequestUser }, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ApiError(401, 'Unauthorized'));
    }

    const userRole = req.user.role;
    if (!allowedRoles.includes(userRole)) {
      return next(new ApiError(403, 'Forbidden: Insufficient permissions'));
    }

    next();
  };
};
