import { Request, Response, NextFunction } from 'express';
import type { RequestUser } from './authenticate';
import { ApiError } from '../utils/ApiError';

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
