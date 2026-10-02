import { Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated } from '../../utils/response';
import { authenticate, authorize, RequestUser } from '../../middlewares/authenticate';
import { validateRequest } from '../../middlewares/validateRequest';
import { z } from 'zod';
import { createAuditLog, getClientIp } from '../../utils/auditLog';
import { SERVICE_REQUEST_STATUS_TRANSITIONS } from '../../constants';
import { createServiceRequestSchema, reviewSchema } from './serviceRequest.validation';
import { uploadToCloudinary } from '../../lib/cloudinary';
import { hasAllowedFileSignature } from '../../middlewares/upload';
import { createNotification } from '../../utils/notification';

const updateServiceRequestSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  preferredDateTime: z.string().datetime().optional(),
});

export const createServiceRequest = [
  validateRequest({ body: createServiceRequestSchema }),
  asyncHandler(async (req: any, res: Response) => {
    let serviceType = null;
    if (req.body.serviceTypeId) {
      serviceType = await prisma.serviceType.findFirst({
        where: { id: req.body.serviceTypeId, deletedAt: null, isActive: true },
      });
    }

    const targetCategoryId = req.body.categoryId || serviceType?.categoryId;
    let category = null;
    if (targetCategoryId) {
      category = await prisma.serviceCategory.findFirst({
        where: { id: targetCategoryId, deletedAt: null, isActive: true },
      });
    }

    // If serviceType was not found by ID or ID was not provided, but we have a custom name or title
    if (!serviceType) {
      const typeName = (req.body.customServiceTypeName || req.body.title || 'General Service').trim();

      // If category is provided, look for or create service type under category
      if (category) {
        serviceType = await prisma.serviceType.findFirst({
          where: {
            categoryId: category.id,
            name: { equals: typeName, mode: 'insensitive' },
            deletedAt: null,
          },
        });

        if (!serviceType) {
          serviceType = await prisma.serviceType.create({
            data: {
              categoryId: category.id,
              name: typeName,
              description: `Custom service: ${typeName}`,
              basePrice: 500,
              durationMinutes: 60,
              isActive: true,
            },
          });
        }
      } else {
        // Fallback: search any active service type or create under the first active category
        serviceType = await prisma.serviceType.findFirst({
          where: { name: { equals: typeName, mode: 'insensitive' }, deletedAt: null },
        });

        if (!serviceType) {
          const firstCat = await prisma.serviceCategory.findFirst({
            where: { deletedAt: null, isActive: true },
          });
          if (firstCat) {
            serviceType = await prisma.serviceType.create({
              data: {
                categoryId: firstCat.id,
                name: typeName,
                description: `Custom service: ${typeName}`,
                basePrice: 500,
                durationMinutes: 60,
                isActive: true,
              },
            });
          }
        }
      }
    }

    if (!serviceType) throw new ApiError(404, 'Valid service type could not be resolved or created');

    if (req.body.preferredDateTime) {
      const preferred = new Date(req.body.preferredDateTime);
      if (isNaN(preferred.getTime()) || preferred <= new Date()) {
        throw new ApiError(400, 'Appointment slot cannot be in the past');
      }

      // Revalidate slot capacity
      const duration = (serviceType.durationMinutes || 120) * 60 * 1000;
      const windowEnd = new Date(preferred.getTime() + duration);

      const activeBookingsCount = await prisma.schedule.count({
        where: {
          cancelledAt: null,
          startAt: { lt: windowEnd },
          endAt: { gt: preferred },
        },
      });

      const totalTechs = await prisma.technicianProfile.count({
        where: {
          isAvailable: true,
          user: { deletedAt: null, isActive: true },
        },
      });

      const maxCapacity = Math.max(3, totalTechs);
      if (activeBookingsCount >= maxCapacity) {
        throw new ApiError(409, 'The selected appointment slot has just been filled. Please choose another time.');
      }
    }

    // Duplicate submission prevention: check if identical pending request was submitted within the last 60s
    const sixtySecondsAgo = new Date(Date.now() - 60 * 1000);
    const duplicate = await prisma.serviceRequest.findFirst({
      where: {
        customerId: req.user!.userId,
        serviceTypeId: serviceType.id,
        title: req.body.title,
        status: 'PENDING',
        createdAt: { gte: sixtySecondsAgo },
        deletedAt: null,
      },
    });

    if (duplicate) {
      throw new ApiError(409, 'Duplicate request detected. A pending ticket with this title was recently submitted.');
    }

    const request = await prisma.serviceRequest.create({
      data: {
        customerId: req.user!.userId,
        serviceTypeId: serviceType.id,
        title: req.body.title,
        description: req.body.description,
        location: req.body.location,
        latitude: req.body.latitude,
        longitude: req.body.longitude,
        preferredDateTime: req.body.preferredDateTime ? new Date(req.body.preferredDateTime) : undefined,
        status: 'PENDING',
      },
      include: { serviceType: { include: { category: true } } },
    });

    await createAuditLog({
      userId: req.user!.userId,
      action: 'SERVICE_REQUEST_CREATED',
      entityType: 'SERVICE_REQUEST',
      entityId: request.id,
      newValues: request,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    // Automated workflow notification to Operations Managers
    try {
      const managers = await prisma.user.findMany({
        where: { role: { in: ['MANAGER', 'ADMIN'] }, isActive: true, deletedAt: null },
        select: { id: true },
        take: 5,
      });
      for (const mgr of managers) {
        await createNotification({
          userId: mgr.id,
          type: 'STATUS_CHANGE',
          title: 'New Service Request',
          message: `New request "${request.title}" awaiting dispatch review.`,
          entityType: 'SERVICE_REQUEST',
          entityId: request.id,
        });
      }
    } catch (notifErr) {
      console.warn('Failed to dispatch manager notification non-fatally:', notifErr);
    }

    sendCreated(res, request, 'Service request created successfully');
  }),
];

export const getServiceRequests = asyncHandler(async (req: any, res: Response) => {
  const { page = 1, limit = 10, status, categoryId, search, sortBy, sortOrder } = req.query;
  const safePage = Math.max(1, Math.min(100000, parseInt(page as string) || 1));
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit as string) || 10));
  const skip = (safePage - 1) * safeLimit;

  const where: Prisma.ServiceRequestWhereInput = {
    deletedAt: null,
    ...(req.user!.role === 'CUSTOMER' ? { customerId: req.user!.userId } : {}),
    ...(status ? { status: status as any } : {}),
    ...(categoryId ? { serviceType: { categoryId: categoryId as string } } : {}),
    ...(search ? {
      OR: [
        { title: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
      ],
    } : {}),
  };

  const sortableFields = new Set(['createdAt', 'updatedAt', 'preferredDateTime', 'status', 'title']);
  const orderBy: any = {};
  if (sortBy && sortableFields.has(sortBy as string)) {
    orderBy[sortBy as string] = sortOrder === 'asc' ? 'asc' : 'desc';
  } else {
    orderBy.createdAt = 'desc';
  }

  const [requests, total] = await Promise.all([
    prisma.serviceRequest.findMany({
      where,
      skip,
      take: safeLimit,
      orderBy,
      include: {
        customer: { select: { id: true, name: true, email: true } },
        serviceType: { include: { category: true } },
        assignments: { include: { technician: { include: { user: { select: { id: true, name: true, email: true } } } } } },
      },
    }),
    prisma.serviceRequest.count({ where }),
  ]);

  sendSuccess(res, requests, 'Service requests fetched successfully', {
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit),
  });
});

export const getServiceRequestById = asyncHandler(async (req: any, res: Response) => {
  const request = await prisma.serviceRequest.findFirst({
    where: {
      id: req.params.id,
      deletedAt: null,
      ...(req.user!.role === 'CUSTOMER' ? { customerId: req.user!.userId } : {}),
    },
    include: {
      customer: { select: { id: true, name: true, email: true } },
      serviceType: { include: { category: true } },
      assignments: { include: { technician: { include: { user: { select: { id: true, name: true, email: true, image: true } } } } } },
    },
  });

  if (!request) throw new ApiError(404, 'Service request not found');

  sendSuccess(res, request, 'Service request fetched successfully');
});

export const updateServiceRequest = asyncHandler(async (req: any, res: Response) => {
  const existing = await prisma.serviceRequest.findFirst({
    where: { id: req.params.id, customerId: req.user!.userId, deletedAt: null },
  });

  if (!existing) throw new ApiError(404, 'Service request not found');
  if (!['PENDING', 'UNDER_REVIEW'].includes(existing.status)) {
    throw new ApiError(400, 'Cannot update request in current status');
  }

  const { categoryId, ...updateData } = req.body;
  const updated = await prisma.serviceRequest.update({
    where: { id: req.params.id },
    data: updateData,
    include: { serviceType: { include: { category: true } } },
  });

  sendSuccess(res, updated, 'Service request updated successfully');
});

export const deleteServiceRequest = asyncHandler(async (req: any, res: Response) => {
  const existing = await prisma.serviceRequest.findFirst({
    where: { id: req.params.id, customerId: req.user!.userId, deletedAt: null },
  });

  if (!existing) throw new ApiError(404, 'Service request not found');
  if (!['PENDING', 'UNDER_REVIEW'].includes(existing.status)) {
    throw new ApiError(400, 'Cannot delete request in current status');
  }

  await prisma.serviceRequest.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date() },
  });

  sendSuccess(res, null, 'Service request deleted successfully');
});

export const reviewServiceRequest = asyncHandler(async (req: any, res: Response) => {
  const serviceRequest = await prisma.serviceRequest.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: { assignments: true },
  });

  if (!serviceRequest) throw new ApiError(404, 'Service request not found');
  if (!['UNDER_REVIEW', 'PENDING'].includes(serviceRequest.status)) {
    throw new ApiError(400, 'Request is not in a reviewable state');
  }

  const action = req.body.action;
  let newStatus: string;
  if (action === 'APPROVE') {
    newStatus = 'APPROVED';
  } else if (action === 'REJECT') {
    newStatus = 'REJECTED';
  } else {
    throw new ApiError(400, 'Invalid action');
  }

  const updated = await prisma.serviceRequest.update({
    where: { id: req.params.id },
    data: {
      status: newStatus as any,
      adminNotes: req.body.adminNotes,
      rejectionReason: req.body.rejectionReason,
    },
    include: { customer: true, serviceType: { include: { category: true } } },
  });

  await createAuditLog({
    userId: req.user!.userId,
    action: 'SERVICE_REQUEST_REVIEWED',
    entityType: 'SERVICE_REQUEST',
    entityId: updated.id,
    oldValues: { status: serviceRequest.status },
    newValues: { status: newStatus, adminNotes: req.body.adminNotes },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'] as string | undefined,
  });

  sendSuccess(res, updated, `Service request ${newStatus.toLowerCase()} successfully`);
});

export const cancelServiceRequest = asyncHandler(async (req: any, res: Response) => {
  const serviceRequest = await prisma.serviceRequest.findFirst({
    where: { id: req.params.id, customerId: req.user!.userId, deletedAt: null },
    include: { assignments: { where: { status: { not: 'CANCELLED' } } } },
  });

  if (!serviceRequest) throw new ApiError(404, 'Service request not found');
  if (!['PENDING', 'UNDER_REVIEW'].includes(serviceRequest.status)) {
    throw new ApiError(400, 'Cannot cancel request in current status');
  }
  if (serviceRequest.assignments.length > 0) {
    throw new ApiError(400, 'Cannot cancel request with active assignment');
  }

  const updated = await prisma.serviceRequest.update({
    where: { id: req.params.id },
    data: { status: 'CANCELLED' },
  });

  await createAuditLog({
    userId: req.user!.userId,
    action: 'SERVICE_REQUEST_CANCELLED',
    entityType: 'SERVICE_REQUEST',
    entityId: updated.id,
    oldValues: { status: serviceRequest.status },
    newValues: { status: 'CANCELLED' },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'] as string | undefined,
  });

  sendSuccess(res, updated, 'Service request cancelled successfully');
});

export const uploadServiceRequestAttachment = asyncHandler(async (req: any, res: Response) => {
  if (!req.file) throw new ApiError(422, 'File is required');
  const request = await prisma.serviceRequest.findFirst({
    where: { id: req.params.id, customerId: req.user!.userId, deletedAt: null },
  });
  if (!request) throw new ApiError(404, 'Service request not found');
  if (!hasAllowedFileSignature(req.file.buffer, req.file.mimetype)) throw new ApiError(422, 'File content does not match its declared type');

  const uploaded: any = await uploadToCloudinary(req.file.buffer, req.file.originalname, 'service-requests');
  const attachment = await prisma.attachment.create({
    data: {
      url: uploaded.secure_url || uploaded.url,
      publicId: uploaded.public_id,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      width: uploaded.width,
      height: uploaded.height,
      entityType: 'SERVICE_REQUEST',
      entityId: request.id,
      uploadedById: req.user!.userId,
    },
  });
  sendCreated(res, attachment, 'Attachment uploaded successfully');
});

export const getAvailableSlots = asyncHandler(async (req: any, res: Response) => {
  const { date, serviceTypeId } = req.query;

  const targetDateStr = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? date
    : new Date().toISOString().split('T')[0];

  // Base technician capacity
  const totalAvailableTechs = await prisma.technicianProfile.count({
    where: {
      isAvailable: true,
      user: { deletedAt: null, isActive: true },
      ...(serviceTypeId
        ? {
            skills: {
              some: {
                skill: {
                  serviceTypeReq: {
                    some: { serviceTypeId: serviceTypeId as string },
                  },
                },
              },
            },
          }
        : {}),
    },
  });

  const capacityPerSlot = Math.max(2, totalAvailableTechs);

  let durationMinutes = 120;
  if (serviceTypeId) {
    const st = await prisma.serviceType.findUnique({
      where: { id: serviceTypeId as string },
      select: { durationMinutes: true },
    });
    if (st?.durationMinutes) {
      durationMinutes = st.durationMinutes;
    }
  }

  // Duration-aware standard business slots
  let slotDefinitions = [
    { id: 'slot-1', label: '09:00 AM - 11:00 AM', startHour: 9, endHour: 11 },
    { id: 'slot-2', label: '11:00 AM - 01:00 PM', startHour: 11, endHour: 13 },
    { id: 'slot-3', label: '02:00 PM - 04:00 PM', startHour: 14, endHour: 16 },
    { id: 'slot-4', label: '04:00 PM - 06:00 PM', startHour: 16, endHour: 18 },
  ];

  if (durationMinutes <= 60) {
    slotDefinitions = [
      { id: 'slot-1', label: '09:00 AM - 10:00 AM', startHour: 9, endHour: 10 },
      { id: 'slot-2', label: '10:00 AM - 11:00 AM', startHour: 10, endHour: 11 },
      { id: 'slot-3', label: '11:00 AM - 12:00 PM', startHour: 11, endHour: 12 },
      { id: 'slot-4', label: '01:00 PM - 02:00 PM', startHour: 13, endHour: 14 },
      { id: 'slot-5', label: '02:00 PM - 03:00 PM', startHour: 14, endHour: 15 },
      { id: 'slot-6', label: '03:00 PM - 04:00 PM', startHour: 15, endHour: 16 },
      { id: 'slot-7', label: '04:00 PM - 05:00 PM', startHour: 16, endHour: 17 },
      { id: 'slot-8', label: '05:00 PM - 06:00 PM', startHour: 17, endHour: 18 },
    ];
  } else if (durationMinutes > 150) {
    slotDefinitions = [
      { id: 'slot-1', label: '09:00 AM - 01:00 PM (Morning Half-Day)', startHour: 9, endHour: 13 },
      { id: 'slot-2', label: '02:00 PM - 06:00 PM (Afternoon Half-Day)', startHour: 14, endHour: 18 },
    ];
  }

  const now = new Date();

  const slots = await Promise.all(
    slotDefinitions.map(async (slot) => {
      const startTime = new Date(`${targetDateStr}T${String(slot.startHour).padStart(2, '0')}:00:00.000Z`);
      const endTime = new Date(`${targetDateStr}T${String(slot.endHour).padStart(2, '0')}:00:00.000Z`);

      // If slot is in the past
      if (startTime < now) {
        return {
          id: slot.id,
          label: slot.label,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          available: false,
          remainingSlots: 0,
          reason: 'Time has passed',
        };
      }

      // Check overlapping schedules
      const bookedSchedulesCount = await prisma.schedule.count({
        where: {
          cancelledAt: null,
          startAt: { lt: endTime },
          endAt: { gt: startTime },
        },
      });

      // Check pending or approved requests requested for this window
      const bookedRequestsCount = await prisma.serviceRequest.count({
        where: {
          deletedAt: null,
          status: { in: ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'ASSIGNED', 'SCHEDULED'] },
          preferredDateTime: { gte: startTime, lt: endTime },
        },
      });

      const totalBooked = bookedSchedulesCount + bookedRequestsCount;
      const remaining = Math.max(0, capacityPerSlot - totalBooked);
      const isAvailable = remaining > 0;

      return {
        id: slot.id,
        label: slot.label,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        available: isAvailable,
        remainingSlots: remaining,
        reason: isAvailable ? undefined : 'Fully booked',
      };
    })
  );

  sendSuccess(res, { date: targetDateStr, slots }, 'Available appointment slots retrieved successfully');
});

export const getServiceTimeline = asyncHandler(async (req: any, res: Response) => {
  const { role, userId } = req.user;
  const { id } = req.params;

  const request = await prisma.serviceRequest.findFirst({
    where: {
      id,
      deletedAt: null,
      ...(role === 'CUSTOMER' ? { customerId: userId } : {}),
    },
    include: {
      serviceType: { include: { category: true } },
      customer: { select: { id: true, name: true, email: true, image: true } },
      assignments: {
        where: { status: { not: 'CANCELLED' } },
        orderBy: { createdAt: 'desc' },
        include: {
          technician: { include: { user: { select: { id: true, name: true, image: true } } } },
          schedule: true,
          workOrder: {
            include: {
              serviceReport: true,
              invoice: { include: { payments: true } },
            },
          },
        },
      },
      quotes: { orderBy: { version: 'desc' } },
    },
  });

  if (!request) {
    throw new ApiError(404, 'Service request not found');
  }

  const activeAssignment = request.assignments[0];
  const activeWorkOrder = activeAssignment?.workOrder;
  const activeSchedule = activeAssignment?.schedule;
  const activeInvoice = activeWorkOrder?.invoice;

  // Retrieve Audit Logs for this request and its work orders
  const workOrderIds = request.assignments
    .map((a) => a.workOrder?.id)
    .filter(Boolean) as string[];

  const auditLogs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entityType: 'SERVICE_REQUEST', entityId: id },
        ...(workOrderIds.length > 0 ? [{ entityType: 'WORK_ORDER' as any, entityId: { in: workOrderIds } }] : []),
      ],
    },
    include: { user: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: 'asc' },
  });

  // Construct events list
  const events: any[] = [
    {
      id: `evt-created`,
      stage: 'REQUEST_SUBMITTED',
      title: 'Service Request Created',
      description: `Request "${request.title}" submitted by ${request.customer?.name || 'Customer'}`,
      timestamp: request.createdAt,
      actor: request.customer?.name,
      role: 'CUSTOMER',
    },
  ];

  if (activeAssignment) {
    events.push({
      id: `evt-assign-${activeAssignment.id}`,
      stage: 'TECHNICIAN_ASSIGNED',
      title: 'Technician Assigned',
      description: `Technician ${activeAssignment.technician?.user?.name || 'Assigned'} was assigned to this request`,
      timestamp: activeAssignment.createdAt,
      actor: activeAssignment.technician?.user?.name,
      role: 'TECHNICIAN',
    });
  }

  if (activeSchedule) {
    events.push({
      id: `evt-sched-${activeSchedule.id}`,
      stage: 'VISIT_SCHEDULED',
      title: 'Visit Scheduled',
      description: `Service visit scheduled for ${new Date(activeSchedule.startAt).toLocaleString()}`,
      timestamp: activeSchedule.createdAt,
    });
  }

  if (activeWorkOrder?.startedAt) {
    events.push({
      id: `evt-started`,
      stage: 'WORK_IN_PROGRESS',
      title: 'Work In Progress',
      description: 'Technician arrived and began service work',
      timestamp: activeWorkOrder.startedAt,
    });
  }

  if (activeWorkOrder?.completedAt) {
    events.push({
      id: `evt-completed`,
      stage: 'WORK_COMPLETED',
      title: 'Work Completed',
      description: 'Technician marked service work as completed',
      timestamp: activeWorkOrder.completedAt,
    });
  }

  if (activeInvoice) {
    events.push({
      id: `evt-invoice`,
      stage: 'INVOICE_ISSUED',
      title: 'Invoice Issued',
      description: `Invoice ${activeInvoice.invoiceNumber} issued for ${activeInvoice.currency} ${activeInvoice.totalAmount}`,
      timestamp: activeInvoice.issuedAt || activeInvoice.createdAt,
    });

    const successfulPayment = activeInvoice.payments?.find((p) => p.status === 'SUCCESS');
    if (successfulPayment || activeInvoice.status === 'PAID') {
      events.push({
        id: `evt-payment`,
        stage: 'PAYMENT_COMPLETED',
        title: 'Payment Completed',
        description: `Payment of ${activeInvoice.currency} ${activeInvoice.totalAmount} completed successfully`,
        timestamp: successfulPayment?.processedAt || activeInvoice.paidAt || activeInvoice.updatedAt,
      });
    }
  }

  // Define full stage progress
  const stages = [
    {
      key: 'REQUEST_SUBMITTED',
      label: 'Request Submitted',
      isCompleted: true,
      timestamp: request.createdAt,
    },
    {
      key: 'UNDER_REVIEW',
      label: 'Under Review',
      isCompleted: ['UNDER_REVIEW', 'APPROVED', 'ASSIGNED', 'SCHEDULED', 'COMPLETED', 'INVOICED', 'PAID', 'CLOSED'].includes(request.status),
      isCurrent: request.status === 'UNDER_REVIEW',
    },
    {
      key: 'APPROVED',
      label: 'Approved',
      isCompleted: ['APPROVED', 'ASSIGNED', 'SCHEDULED', 'COMPLETED', 'INVOICED', 'PAID', 'CLOSED'].includes(request.status),
      isCurrent: request.status === 'APPROVED',
    },
    {
      key: 'TECHNICIAN_ASSIGNED',
      label: 'Technician Assigned',
      isCompleted: Boolean(activeAssignment && ['ACCEPTED', 'SCHEDULED', 'PENDING'].includes(activeAssignment.status)),
      isCurrent: request.status === 'ASSIGNED',
      meta: activeAssignment?.technician?.user ? { name: activeAssignment.technician.user.name, image: activeAssignment.technician.user.image } : null,
    },
    {
      key: 'VISIT_SCHEDULED',
      label: 'Visit Scheduled',
      isCompleted: Boolean(activeSchedule && !activeSchedule.cancelledAt),
      isCurrent: request.status === 'SCHEDULED' && (!activeWorkOrder || activeWorkOrder.status === 'SCHEDULED'),
      meta: activeSchedule ? { startAt: activeSchedule.startAt, endAt: activeSchedule.endAt } : null,
    },
    {
      key: 'WORK_IN_PROGRESS',
      label: 'Work In Progress',
      isCompleted: ['IN_PROGRESS', 'COMPLETED'].includes(activeWorkOrder?.status || ''),
      isCurrent: activeWorkOrder?.status === 'IN_PROGRESS',
    },
    {
      key: 'WORK_COMPLETED',
      label: 'Work Completed',
      isCompleted: activeWorkOrder?.status === 'COMPLETED' || ['COMPLETED', 'INVOICED', 'PAID', 'CLOSED'].includes(request.status),
      isCurrent: activeWorkOrder?.status === 'COMPLETED' && (!activeInvoice || activeInvoice.status === 'DRAFT'),
      timestamp: activeWorkOrder?.completedAt,
    },
    {
      key: 'INVOICE_ISSUED',
      label: 'Invoice Issued',
      isCompleted: Boolean(activeInvoice && activeInvoice.status !== 'DRAFT'),
      isCurrent: Boolean(activeInvoice && activeInvoice.status === 'PENDING'),
      meta: activeInvoice ? { invoiceNumber: activeInvoice.invoiceNumber, totalAmount: activeInvoice.totalAmount, currency: activeInvoice.currency } : null,
    },
    {
      key: 'PAYMENT_COMPLETED',
      label: 'Payment Completed',
      isCompleted: activeInvoice?.status === 'PAID' || request.status === 'PAID',
      isCurrent: activeInvoice?.status === 'PAID' || request.status === 'PAID',
    },
  ];

  sendSuccess(res, {
    request,
    currentStatus: request.status,
    stages,
    events,
    auditLogs,
  }, 'Service timeline retrieved successfully');
});

export const rescheduleServiceRequest = asyncHandler(async (req: any, res: Response) => {
  const { userId } = req.user;
  const { id } = req.params;
  const { preferredDateTime, reason } = req.body;

  if (!preferredDateTime) {
    throw new ApiError(400, 'Preferred date and time is required for rescheduling');
  }

  const newDateTime = new Date(preferredDateTime);
  if (isNaN(newDateTime.getTime()) || newDateTime <= new Date()) {
    throw new ApiError(400, 'Rescheduled appointment must be set to a future date and time');
  }

  const existing = await prisma.serviceRequest.findFirst({
    where: { id, customerId: userId, deletedAt: null },
    include: {
      assignments: {
        where: { status: { not: 'CANCELLED' } },
        include: { schedule: true },
      },
    },
  });

  if (!existing) {
    throw new ApiError(404, 'Service request not found');
  }

  if (['COMPLETED', 'CANCELLED', 'REJECTED', 'CLOSED', 'INVOICED', 'PAID'].includes(existing.status)) {
    throw new ApiError(400, `Cannot reschedule request in "${existing.status}" status`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedSr = await tx.serviceRequest.update({
      where: { id },
      data: {
        preferredDateTime: newDateTime,
        adminNotes: reason ? `Customer rescheduled: ${reason}` : existing.adminNotes,
      },
      include: { serviceType: { include: { category: true } } },
    });

    // If an active schedule exists, adjust it
    const activeAssignment = existing.assignments[0];
    if (activeAssignment?.schedule) {
      const duration = activeAssignment.schedule.endAt.getTime() - activeAssignment.schedule.startAt.getTime();
      const newEnd = new Date(newDateTime.getTime() + (duration > 0 ? duration : 2 * 60 * 60 * 1000));

      await tx.schedule.update({
        where: { id: activeAssignment.schedule.id },
        data: {
          startAt: newDateTime,
          endAt: newEnd,
        },
      });
    }

    return updatedSr;
  });

  await createAuditLog({
    userId,
    action: 'SERVICE_REQUEST_RESCHEDULED',
    entityType: 'SERVICE_REQUEST',
    entityId: id,
    oldValues: { preferredDateTime: existing.preferredDateTime },
    newValues: { preferredDateTime: newDateTime, reason },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'] as string | undefined,
  });

  sendSuccess(res, updated, 'Service request rescheduled successfully');
});

export const rebookServiceRequest = asyncHandler(async (req: any, res: Response) => {
  const { userId } = req.user;
  const { id } = req.params;
  const { preferredDateTime, location, latitude, longitude, description } = req.body;

  const historical = await prisma.serviceRequest.findFirst({
    where: { id, customerId: userId, deletedAt: null },
    include: { serviceType: true },
  });

  if (!historical) {
    throw new ApiError(404, 'Historical service request not found');
  }

  if (!historical.serviceType.isActive || historical.serviceType.deletedAt) {
    throw new ApiError(400, 'The service type for this request is currently not offered');
  }

  const targetDateTime = preferredDateTime ? new Date(preferredDateTime) : undefined;
  if (targetDateTime && (isNaN(targetDateTime.getTime()) || targetDateTime <= new Date())) {
    throw new ApiError(400, 'Preferred appointment must be in the future');
  }

  const newRequest = await prisma.serviceRequest.create({
    data: {
      customerId: userId,
      serviceTypeId: historical.serviceTypeId,
      title: `Rebooking: ${historical.title.replace(/^Rebooking:\s*/, '')}`,
      description: description || historical.description,
      location: location || historical.location,
      latitude: latitude !== undefined ? latitude : historical.latitude,
      longitude: longitude !== undefined ? longitude : historical.longitude,
      preferredDateTime: targetDateTime,
      status: 'PENDING',
    },
    include: {
      serviceType: { include: { category: true } },
    },
  });

  await createAuditLog({
    userId,
    action: 'SERVICE_REQUEST_REBOOKED',
    entityType: 'SERVICE_REQUEST',
    entityId: newRequest.id,
    oldValues: { rebookedFromId: id },
    newValues: newRequest,
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'] as string | undefined,
  });

  sendCreated(res, newRequest, 'Service rebooked successfully as a new request');
});

export const getTrackServiceRequest = asyncHandler(async (req: any, res: Response) => {
  const { id } = req.params;

  const request = await prisma.serviceRequest.findFirst({
    where: {
      OR: [
        { id },
        { id: { startsWith: id } },
      ],
      deletedAt: null,
    },
    include: {
      serviceType: { include: { category: true } },
      assignments: {
        where: { status: { not: 'CANCELLED' } },
        include: {
          technician: { include: { user: { select: { name: true, image: true } } } },
          workOrder: { select: { status: true, startedAt: true, completedAt: true } },
          schedule: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!request) {
    throw new ApiError(404, 'Service request not found with this tracking reference');
  }

  const activeAssignment = request.assignments[0];
  const activeWorkOrder = activeAssignment?.workOrder;
  const activeSchedule = activeAssignment?.schedule;

  const stages = [
    { key: 'SUBMITTED', label: 'Request Submitted', done: true, timestamp: request.createdAt },
    {
      key: 'REVIEW',
      label: 'Manager Review',
      done: ['UNDER_REVIEW', 'APPROVED', 'ASSIGNED', 'SCHEDULED', 'COMPLETED', 'INVOICED', 'PAID', 'CLOSED'].includes(request.status),
      timestamp: request.updatedAt,
    },
    {
      key: 'APPROVED',
      label: 'Approved for Dispatch',
      done: ['APPROVED', 'ASSIGNED', 'SCHEDULED', 'COMPLETED', 'INVOICED', 'PAID', 'CLOSED'].includes(request.status),
    },
    {
      key: 'ASSIGNED',
      label: 'Technician Assigned',
      done: Boolean(activeAssignment),
      timestamp: activeAssignment?.createdAt,
      technicianName: activeAssignment?.technician?.user?.name,
    },
    {
      key: 'SCHEDULED',
      label: 'Visit Scheduled',
      done: Boolean(activeSchedule),
      scheduledStartAt: activeSchedule?.startAt,
      scheduledEndAt: activeSchedule?.endAt,
    },
    {
      key: 'IN_PROGRESS',
      label: 'Service In Progress',
      done: ['IN_PROGRESS', 'COMPLETED'].includes(activeWorkOrder?.status || ''),
      timestamp: activeWorkOrder?.startedAt,
    },
    {
      key: 'COMPLETED',
      label: 'Service Completed',
      done: activeWorkOrder?.status === 'COMPLETED' || ['COMPLETED', 'INVOICED', 'PAID', 'CLOSED'].includes(request.status),
      timestamp: activeWorkOrder?.completedAt,
    },
  ];

  const trackingSummary = {
    id: request.id,
    title: request.title,
    status: request.status,
    createdAt: request.createdAt,
    preferredDateTime: request.preferredDateTime,
    categoryName: request.serviceType?.category?.name || 'General Maintenance',
    serviceTypeName: request.serviceType?.name || 'Standard Service',
    assignedTechnician: activeAssignment?.technician?.user ? {
      name: activeAssignment.technician.user.name,
      image: activeAssignment.technician.user.image,
    } : null,
    scheduledWindow: activeSchedule ? {
      startAt: activeSchedule.startAt,
      endAt: activeSchedule.endAt,
    } : null,
    stages,
  };

  sendSuccess(res, trackingSummary, 'Service tracking details retrieved successfully');
});


