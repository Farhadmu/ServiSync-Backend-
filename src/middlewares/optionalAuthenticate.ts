import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import type { RequestUser } from '../utils/jwt';
import { prisma } from '../lib/prisma';

export const optionalAuthenticate = async (
  req: Request & { user?: RequestUser },
  _res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyAccessToken(token);

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
