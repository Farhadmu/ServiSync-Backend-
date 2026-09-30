import { Request, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';

export const optionalAuthenticate = async (req: Request & { user?: any }, _res: any, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    const { verifyAccessToken } = require('../utils/jwt');
    const payload = verifyAccessToken(token);

    const { prisma } = require('../lib/prisma');
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true, isActive: true, deletedAt: true },
    });

    if (!user || user.deletedAt || !user.isActive) {
      return next();
    }

    req.user = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    next();
  } catch {
    next();
  }
};
