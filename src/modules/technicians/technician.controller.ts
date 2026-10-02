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
  // Ensure all active users with role TECHNICIAN have an active technicianProfile
  const technicianUsersWithoutProfile = await prisma.user.findMany({
    where: {
      role: 'TECHNICIAN',
      deletedAt: null,
      technicianProfile: null,
    },
    select: { id: true },
  });

  if (technicianUsersWithoutProfile.length > 0) {
    for (const u of technicianUsersWithoutProfile) {
      await prisma.technicianProfile.upsert({
        where: { userId: u.id },
        update: {},
        create: {
          userId: u.id,
          bio: 'Certified Service Technician',
          experienceYears: 2,
          hourlyRate: 50,
          isAvailable: true,
        },
      });
    }
  }

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

export const getPublicTechnicianProfile = asyncHandler(async (req: any, res: Response) => {
  const { id } = req.params;

  const technician = await prisma.technicianProfile.findFirst({
    where: {
      OR: [{ id }, { userId: id }],
      user: { deletedAt: null, isActive: true },
    },
    include: {
      user: { select: { id: true, name: true, image: true } },
      skills: { include: { skill: true } },
    },
  });

  if (!technician) {
    throw new ApiError(404, 'Technician not found');
  }

  // Calculate real verified stats
  const [completedCount, feedbacks] = await Promise.all([
    prisma.workOrder.count({
      where: {
        assignment: { technicianId: technician.id },
        status: 'COMPLETED',
      },
    }),
    prisma.feedback.findMany({
      where: { technicianId: technician.userId },
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        customer: { select: { name: true, image: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);

  const totalReviews = feedbacks.length;
  const averageRating =
    totalReviews > 0
      ? Number((feedbacks.reduce((acc, f) => acc + f.rating, 0) / totalReviews).toFixed(1))
      : 0;

  const publicProfile = {
    id: technician.id,
    userId: technician.userId,
    name: technician.user.name,
    image: technician.user.image,
    bio: technician.bio || 'Professional Field Service Technician',
    experienceYears: technician.experienceYears || 0,
    skills: technician.skills.map((s) => ({
      id: s.skill.id,
      name: s.skill.name,
      proficiency: s.proficiency || 'Standard',
    })),
    stats: {
      completedJobs: completedCount,
      totalReviews,
      averageRating,
    },
    reviews: feedbacks.map((f) => ({
      id: f.id,
      rating: f.rating,
      comment: f.comment,
      createdAt: f.createdAt,
      customerName: f.customer?.name || 'Customer',
      customerImage: f.customer?.image,
    })),
  };

  sendSuccess(res, publicProfile, 'Public technician profile retrieved successfully');
});

export const getPublicTechnicians = asyncHandler(async (req: any, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 12));
  const skill = req.query.skill as string | undefined;
  const skip = (page - 1) * limit;

  const where: Prisma.TechnicianProfileWhereInput = {
    user: { deletedAt: null, isActive: true },
    ...(skill && {
      skills: { some: { skill: { name: { contains: skill as string, mode: 'insensitive' } } } },
    }),
  };

  const [technicians, total] = await Promise.all([
    prisma.technicianProfile.findMany({
      where,
      skip,
      take: limit,
      include: {
        user: { select: { id: true, name: true, image: true } },
        skills: { include: { skill: true } },
      },
      orderBy: { experienceYears: 'desc' },
    }),
    prisma.technicianProfile.count({ where }),
  ]);

  const techUserIds = technicians.map((t) => t.userId);
  const techProfileIds = technicians.map((t) => t.id);

  const [feedbacks, completedCounts] = await Promise.all([
    prisma.feedback.findMany({
      where: { technicianId: { in: techUserIds } },
      select: { technicianId: true, rating: true },
    }),
    prisma.assignment.findMany({
      where: {
        technicianId: { in: techProfileIds },
        workOrder: { status: 'COMPLETED' },
      },
      select: { technicianId: true },
    }),
  ]);

  const feedbackMap = new Map<string, number[]>();
  feedbacks.forEach((f) => {
    const list = feedbackMap.get(f.technicianId) || [];
    list.push(f.rating);
    feedbackMap.set(f.technicianId, list);
  });

  const completedMap = new Map<string, number>();
  completedCounts.forEach((c) => {
    completedMap.set(c.technicianId, (completedMap.get(c.technicianId) || 0) + 1);
  });

  const publicList = technicians.map((t) => {
    const ratings = feedbackMap.get(t.userId) || [];
    const avgRating =
      ratings.length > 0
        ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1))
        : 5.0;

    return {
      id: t.id,
      userId: t.userId,
      name: t.user.name,
      image: t.user.image,
      bio: t.bio || 'Certified Field Service Professional',
      experienceYears: t.experienceYears || 2,
      isAvailable: t.isAvailable ?? true,
      skills: t.skills.map((s) => s.skill.name),
      completedJobs: completedMap.get(t.id) || Math.max(1, (t.experienceYears || 1) * 8),
      averageRating: avgRating,
      totalReviews: ratings.length,
    };
  });

  sendSuccess(res, publicList, 'Public technicians retrieved successfully', {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});


