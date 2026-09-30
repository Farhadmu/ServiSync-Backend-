import { Response } from 'express';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated } from '../../utils/response';
import { createAuditLog, getClientIp } from '../../utils/auditLog';

export const getTickets = asyncHandler(async (req: any, res: Response) => {
  const { role, userId } = req.user;
  const { status, category, page = 1, limit = 10 } = req.query;

  const pageNum = Math.max(1, parseInt(page as string) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit as string) || 10));
  const skip = (pageNum - 1) * limitNum;

  const where: any = {};

  if (role === 'CUSTOMER') {
    where.customerId = userId;
  }

  if (status) {
    where.status = status;
  }

  if (category) {
    where.category = category;
  }

  const [tickets, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { updatedAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true, email: true, image: true } },
        serviceRequest: { select: { id: true, title: true, status: true } },
        _count: { select: { messages: true } },
      },
    }),
    prisma.supportTicket.count({ where }),
  ]);

  sendSuccess(res, tickets, 'Support tickets retrieved successfully', {
    page: pageNum,
    limit: limitNum,
    total,
    totalPages: Math.ceil(total / limitNum),
  });
});

export const getTicketById = asyncHandler(async (req: any, res: Response) => {
  const { role, userId } = req.user;
  const { id } = req.params;

  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, email: true, image: true } },
      serviceRequest: {
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          location: true,
        },
      },
      messages: {
        orderBy: { createdAt: 'asc' },
        include: {
          sender: { select: { id: true, name: true, role: true, image: true } },
        },
      },
    },
  });

  if (!ticket) {
    throw new ApiError(404, 'Support ticket not found');
  }

  if (role === 'CUSTOMER' && ticket.customerId !== userId) {
    throw new ApiError(403, 'You do not have permission to view this ticket');
  }

  sendSuccess(res, ticket, 'Ticket details retrieved successfully');
});

export const createTicket = asyncHandler(async (req: any, res: Response) => {
  const { userId } = req.user;
  const { subject, category, description, priority, serviceRequestId } = req.body;

  if (serviceRequestId) {
    const sr = await prisma.serviceRequest.findUnique({
      where: { id: serviceRequestId },
      select: { customerId: true },
    });
    if (!sr || sr.customerId !== userId) {
      throw new ApiError(400, 'Invalid service request selected');
    }
  }

  const count = await prisma.supportTicket.count();
  const ticketNumber = `TICK-${(count + 1).toString().padStart(5, '0')}`;

  const ticket = await prisma.$transaction(async (tx) => {
    const created = await tx.supportTicket.create({
      data: {
        ticketNumber,
        customerId: userId,
        serviceRequestId: serviceRequestId || null,
        category,
        priority: priority || 'MEDIUM',
        subject,
        description,
      },
    });

    await tx.supportTicketMessage.create({
      data: {
        ticketId: created.id,
        senderId: userId,
        message: description,
        isStaffReply: false,
      },
    });

    return created;
  });

  await createAuditLog({
    userId,
    action: 'CREATE_SUPPORT_TICKET',
    entityType: 'SUPPORT_TICKET' as any,
    entityId: ticket.id,
    newValues: ticket,
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  sendCreated(res, ticket, 'Support ticket created successfully');
});

export const addTicketMessage = asyncHandler(async (req: any, res: Response) => {
  const { role, userId } = req.user;
  const { id } = req.params;
  const { message } = req.body;

  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
  });

  if (!ticket) {
    throw new ApiError(404, 'Support ticket not found');
  }

  if (role === 'CUSTOMER' && ticket.customerId !== userId) {
    throw new ApiError(403, 'You do not have permission to reply to this ticket');
  }

  if (ticket.status === 'CLOSED') {
    throw new ApiError(400, 'Cannot reply to a closed ticket. Please open a new ticket.');
  }

  const isStaff = role === 'MANAGER' || role === 'ADMIN';

  let nextStatus = ticket.status;
  if (isStaff && (ticket.status === 'OPEN' || ticket.status === 'WAITING_FOR_CUSTOMER')) {
    nextStatus = 'WAITING_FOR_CUSTOMER';
  } else if (!isStaff && ticket.status === 'WAITING_FOR_CUSTOMER') {
    nextStatus = 'IN_PROGRESS';
  }

  const createdMessage = await prisma.$transaction(async (tx) => {
    const msg = await tx.supportTicketMessage.create({
      data: {
        ticketId: id,
        senderId: userId,
        message,
        isStaffReply: isStaff,
      },
      include: {
        sender: { select: { id: true, name: true, role: true, image: true } },
      },
    });

    await tx.supportTicket.update({
      where: { id },
      data: {
        status: nextStatus,
        updatedAt: new Date(),
      },
    });

    return msg;
  });

  sendCreated(res, createdMessage, 'Message added successfully');
});

export const updateTicketStatus = asyncHandler(async (req: any, res: Response) => {
  const { role, userId } = req.user;
  const { id } = req.params;
  const { status } = req.body;

  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
  });

  if (!ticket) {
    throw new ApiError(404, 'Support ticket not found');
  }

  if (role === 'CUSTOMER') {
    if (ticket.customerId !== userId) {
      throw new ApiError(403, 'Permission denied');
    }
    if (status !== 'CLOSED') {
      throw new ApiError(400, 'Customers may only close their tickets');
    }
  }

  const updated = await prisma.supportTicket.update({
    where: { id },
    data: {
      status,
      closedAt: status === 'CLOSED' || status === 'RESOLVED' ? new Date() : null,
    },
  });

  await createAuditLog({
    userId,
    action: 'UPDATE_TICKET_STATUS',
    entityType: 'SUPPORT_TICKET' as any,
    entityId: id,
    oldValues: { status: ticket.status },
    newValues: { status: updated.status },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  sendSuccess(res, updated, `Ticket status updated to ${status}`);
});
