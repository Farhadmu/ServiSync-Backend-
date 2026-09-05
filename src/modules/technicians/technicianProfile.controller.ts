import { Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/response';
import { authenticate } from '../../middlewares/authenticate';
import type { RequestUser } from '../../middlewares/authenticate';
import { validateRequest } from '../../middlewares/validateRequest';
import { z } from 'zod';
import { createAuditLog, getClientIp } from '../../utils/auditLog';
import { getCached, setCache } from '../../lib/redis';

const updateProfileSchema = z.object({
  bio: z.string().optional(),
  experienceYears: z.coerce.number().int().positive().optional(),
  hourlyRate: z.coerce.number().positive().optional(),
  baseLatitude: z.coerce.number().optional(),
  baseLongitude: z.coerce.number().optional(),
});

const updateAvailabilitySchema = z.object({
  isAvailable: z.boolean(),
});

const updateSkillsSchema = z.object({
  skills: z.array(z.object({ id: z.string(), proficiency: z.string().optional() })).optional(),
  newSkills: z.array(z.object({ name: z.string(), proficiency: z.string().optional() })).optional(),
});

export const getMyProfile = asyncHandler(async (req: any, res: Response) => {
  const profile = await prisma.technicianProfile.findFirst({
    where: { userId: req.user!.userId },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      skills: { include: { skill: true } },
    },
  });

  if (!profile) throw new ApiError(404, 'Technician profile not found');
  sendSuccess(res, profile, 'Technician profile fetched successfully');
});

export const updateMyProfile = [
  validateRequest({ body: updateProfileSchema }),
  asyncHandler(async (req: any, res: Response) => {
    const profile = await prisma.technicianProfile.update({
      where: { userId: req.user!.userId },
      data: req.body,
      include: { user: true, skills: { include: { skill: true } } },
    });

    await createAuditLog({
      userId: req.user!.userId,
      action: 'USER_UPDATED',
      entityType: 'USER',
      entityId: req.user!.userId,
      newValues: req.body,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    sendSuccess(res, profile, 'Profile updated successfully');
  }),
];

export const updateMyAvailability = [
  validateRequest({ body: updateAvailabilitySchema }),
  asyncHandler(async (req: any, res: Response) => {
    const profile = await prisma.technicianProfile.update({
      where: { userId: req.user!.userId },
      data: { isAvailable: req.body.isAvailable },
      include: { user: true },
    });

    await createAuditLog({
      userId: req.user!.userId,
      action: 'USER_UPDATED',
      entityType: 'USER',
      entityId: req.user!.userId,
      newValues: { isAvailable: req.body.isAvailable },
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    sendSuccess(res, profile, 'Availability updated successfully');
  }),
];

export const updateMySkills = [
  validateRequest({ body: updateSkillsSchema }),
  asyncHandler(async (req: any, res: Response) => {
    const technicianProfile = await prisma.technicianProfile.findFirst({
      where: { userId: req.user!.userId },
    });

    if (!technicianProfile) throw new ApiError(404, 'Technician profile not found');

    const newSkills = req.body.newSkills || [];
    const existingSkills = req.body.skills || [];

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (newSkills.length > 0) {
        for (const skill of newSkills) {
          const existingSkill = await tx.skill.findUnique({ where: { name: skill.name.toUpperCase() } });
          if (!existingSkill) {
            await tx.skill.create({ data: { name: skill.name.toUpperCase(), description: skill.proficiency } });
          }
        }
      }

      await tx.technicianSkill.deleteMany({
        where: { technicianId: technicianProfile.id, skillId: { notIn: existingSkills.map((s: any) => s.id) } },
      });

      for (const skill of existingSkills) {
        await tx.technicianSkill.upsert({
          where: { technicianId_skillId: { technicianId: technicianProfile.id, skillId: skill.id } },
          update: { proficiency: skill.proficiency },
          create: { technicianId: technicianProfile.id, skillId: skill.id, proficiency: skill.proficiency },
        });
      }
    });

    const updated = await prisma.technicianProfile.findFirst({
      where: { userId: req.user!.userId },
      include: { skills: { include: { skill: true } } },
    });

    sendSuccess(res, updated, 'Skills updated successfully');
  }),
];

export const getMyJobs = asyncHandler(async (req: any, res: Response) => {
  const technicianProfile = await prisma.technicianProfile.findFirst({
    where: { userId: req.user!.userId },
  });

  if (!technicianProfile) throw new ApiError(404, 'Technician profile not found');

  const assignments = await prisma.assignment.findMany({
    where: { technicianId: technicianProfile.id, status: { not: 'CANCELLED' } },
    include: {
      serviceRequest: { include: { customer: { select: { id: true, name: true, email: true } }, serviceType: { include: { category: true } } } },
      workOrder: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  sendSuccess(res, assignments, 'Assigned jobs fetched successfully');
});

export const getMySchedule = asyncHandler(async (req: any, res: Response) => {
  const technicianProfile = await prisma.technicianProfile.findFirst({
    where: { userId: req.user!.userId },
  });

  if (!technicianProfile) throw new ApiError(404, 'Technician profile not found');

  const assignments = await prisma.assignment.findMany({
    where: { technicianId: technicianProfile.id, status: { in: ['SCHEDULED', 'ACCEPTED'] } },
    include: {
      serviceRequest: { include: { customer: { select: { name: true, email: true } }, serviceType: { include: { category: true } } } },
      workOrder: true,
      schedule: true,
    },
    orderBy: { schedule: { startAt: 'asc' } },
  });

  sendSuccess(res, assignments, 'Schedule fetched successfully');
});
