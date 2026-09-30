import { Response } from 'express';
import prisma from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated } from '../../utils/response';
import { createAuditLog, getClientIp } from '../../utils/auditLog';
import { serviceReportSchema, serviceReportParamsSchema } from './serviceReport.validation';

export const upsertServiceReport = [
  asyncHandler(async (req: any, res: Response) => {
    const { workOrderId } = serviceReportParamsSchema.parse(req.params);
    const data = serviceReportSchema.parse(req.body);
    const technician = await prisma.technicianProfile.findFirst({ where: { userId: req.user!.userId } });

    if (!technician) throw new ApiError(404, 'Technician profile not found');

    const workOrder = await prisma.workOrder.findFirst({
      where: { id: workOrderId, status: 'COMPLETED', assignment: { technicianId: technician.id } },
      include: { serviceReport: true },
    });
    if (!workOrder) throw new ApiError(404, 'Completed work order not found');

    const report = await prisma.serviceReport.upsert({
      where: { workOrderId },
      update: data,
      create: { workOrderId, technicianId: technician.id, ...data },
    });

    await createAuditLog({
      userId: req.user!.userId,
      action: 'SERVICE_REPORT_SUBMITTED',
      entityType: 'SERVICE_REPORT',
      entityId: report.id,
      newValues: data,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    return workOrder.serviceReport ? sendSuccess(res, report, 'Service report updated successfully') : sendCreated(res, report, 'Service report submitted successfully');
  }),
];

export const getServiceReport = asyncHandler(async (req: any, res: Response) => {
  const { workOrderId } = serviceReportParamsSchema.parse(req.params);
  const report = await prisma.serviceReport.findUnique({
    where: { workOrderId },
    include: { workOrder: { include: { assignment: { include: { serviceRequest: true } } } }, technician: { include: { user: true } } },
  });
  if (!report) throw new ApiError(404, 'Service report not found');

  const isOwner = report.workOrder.assignment.serviceRequest.customerId === req.user!.userId || report.technician.userId === req.user!.userId;
  if (!isOwner && !['MANAGER', 'ADMIN'].includes(req.user!.role)) throw new ApiError(403, 'Access denied');

  sendSuccess(res, report, 'Service report fetched successfully');
});
