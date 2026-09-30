import { Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/response';
import { authenticate, authorize, RequestUser } from '../../middlewares/authenticate';
import { validateRequest } from '../../middlewares/validateRequest';
import { z } from 'zod';
import { createAuditLog, getClientIp } from '../../utils/auditLog';

const technicianQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  skill: z.string().optional(),
  availability: z.enum(['AVAILABLE', 'UNAVAILABLE']).optional(),
  search: z.string().optional(),
});

export const getTechnicians = asyncHandler(async (req: any, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
  const skill = req.query.skill as string | undefined;
  const availability = req.query.availability as string | undefined;
  const search = req.query.search as string | undefined;
  const skip = (page - 1) * limit;

  const where: Prisma.TechnicianProfileWhereInput = {
    user: { deletedAt: null, isActive: true },
    ...(availability && { isAvailable: availability === 'AVAILABLE' }),
    ...(skill && {
      skills: { some: { skill: { name: { contains: skill as string, mode: 'insensitive' } } } },
    }),
    ...(search && {
      OR: [
        { user: { name: { contains: search as string, mode: 'insensitive' } } },
        { bio: { contains: search as string, mode: 'insensitive' } },
      ],
    }),
  };

  const [technicians, total] = await Promise.all([
    prisma.technicianProfile.findMany({
      where,
      skip,
      take: limit,
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
        skills: { include: { skill: true } },
      },
    }),
    prisma.technicianProfile.count({ where }),
  ]);

  sendSuccess(res, technicians, 'Technicians fetched successfully', {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

export const getTechnicianById = asyncHandler(async (req: any, res: Response) => {
  const technician = await prisma.technicianProfile.findFirst({
    where: { id: req.params.id, user: { deletedAt: null } },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      skills: { include: { skill: true } },
      assignments: { where: { status: { not: 'CANCELLED' } }, include: { serviceRequest: true } },
    },
  });

  if (!technician) throw new ApiError(404, 'Technician not found');

  sendSuccess(res, technician, 'Technician fetched successfully');
});
