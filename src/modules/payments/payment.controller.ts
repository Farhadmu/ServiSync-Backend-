import { Response, NextFunction } from 'express';
import Stripe from 'stripe';
import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/response';
import { authenticate, authorize, RequestUser } from '../../middlewares/authenticate';
import { validateRequest } from '../../middlewares/validateRequest';
import { z } from 'zod';
import { createAuditLog, getClientIp } from '../../utils/auditLog';
import { env } from '../../config/env';

let stripeClient: Stripe | null = null;
function getStripe() {
  if (!stripeClient && env.STRIPE_SECRET_KEY) {
    stripeClient = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2025-08-27.basil' });
  }
  if (!stripeClient) throw new ApiError(500, 'Payment provider not configured');
  return stripeClient;
}

const initiateSchema = z.object({
  invoiceId: z.string().min(1, 'Invoice ID is required'),
});

export const initiatePayment = [
  validateRequest({ body: initiateSchema }),
  asyncHandler(async (req: any, res: Response) => {
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.body.invoiceId, status: 'PENDING' },
      include: { workOrder: { include: { assignment: { include: { serviceRequest: { include: { customer: true } } } } } } },
    });

    if (!invoice) throw new ApiError(404, 'Invoice not found or not payable');
    if (invoice.workOrder.assignment.serviceRequest.customerId !== req.user!.userId) {
      throw new ApiError(403, 'You do not own this invoice');
    }
    if (invoice.dueAmount.lessThanOrEqualTo(0)) throw new ApiError(400, 'Invoice has no outstanding balance');

    const existingPending = await prisma.payment.findFirst({
      where: { invoiceId: invoice.id, status: 'PENDING' },
    });
    if (existingPending) {
      throw new ApiError(409, 'A payment is already pending for this invoice');
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: invoice.currency.toLowerCase(),
            product_data: { name: `Invoice ${invoice.invoiceNumber}` },
            unit_amount: invoice.dueAmount.mul(100).toNumber(),
          },
          quantity: 1,
        },
      ],
      success_url: `${env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.FRONTEND_URL}/payment/cancel`,
      metadata: { invoiceId: invoice.id, customerId: req.user!.userId },
    });

    const payment = await prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        customerId: req.user!.userId,
        status: 'PENDING',
        provider: 'STRIPE',
        providerSessionId: session.id,
        amount: invoice.dueAmount,
        currency: invoice.currency,
      },
    });

    await createAuditLog({
      userId: req.user!.userId,
      action: 'PAYMENT_INITIATED',
      entityType: 'PAYMENT',
      entityId: payment.id,
      newValues: { invoiceId: invoice.id, amount: invoice.totalAmount, providerSessionId: session.id },
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    sendSuccess(res, { paymentId: payment.id, sessionUrl: session.url, sessionId: session.id }, 'Payment initiated successfully');
  }),
];

export const handlePaymentSuccess = asyncHandler(async (req: any, res: Response) => {
  const { session_id } = req.query;
  if (!session_id) throw new ApiError(400, 'session_id is required');

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(session_id as string);

  if (session.payment_status !== 'paid') {
    throw new ApiError(400, 'Payment not completed');
  }

  const invoiceId = session.metadata?.invoiceId;
  if (!invoiceId) throw new ApiError(400, 'Invalid session metadata');

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const payment = await tx.payment.findFirst({
      where: { providerSessionId: session.id },
    });

    if (!payment) throw new ApiError(404, 'Payment record not found');
    if (payment.status === 'SUCCESS') return;

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCESS',
        providerPaymentId: session.payment_intent as string,
        processedAt: new Date(),
      },
    });

    await tx.invoice.update({
      where: { id: payment.invoiceId },
      data: { status: 'PAID', paidAt: new Date() },
    });

        const workOrder = await tx.workOrder.findFirst({
          where: { invoice: { id: payment.invoiceId } },
          include: { assignment: true },
        });

    if (workOrder) {
      await tx.serviceRequest.update({
        where: { id: workOrder.assignment.serviceRequestId },
        data: { status: 'CLOSED', closedAt: new Date() },
      });
    }
  });

  sendSuccess(res, null, 'Payment verified successfully');
});

export const handlePaymentFail = asyncHandler(async (req: any, res: Response) => {
  const { session_id } = req.query;
  if (!session_id) throw new ApiError(400, 'session_id is required');

  const payment = await prisma.payment.findFirst({ where: { providerSessionId: session_id as string } });
  if (payment && payment.status === 'PENDING') {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', failureReason: 'Payment failed at gateway' } });
    await createAuditLog({ userId: payment.customerId, action: 'PAYMENT_FAILED', entityType: 'PAYMENT', entityId: payment.id, ipAddress: getClientIp(req), userAgent: req.headers['user-agent'] as string | undefined });
  }

  sendSuccess(res, null, 'Payment failure recorded');
});

export const handlePaymentCancel = asyncHandler(async (req: any, res: Response) => {
  const { session_id } = req.query;
  if (!session_id) throw new ApiError(400, 'session_id is required');

  const payment = await prisma.payment.findFirst({ where: { providerSessionId: session_id as string } });
  if (payment) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'CANCELLED' } });
  }

  sendSuccess(res, null, 'Payment cancelled');
});

export const handlePaymentWebhook = asyncHandler(async (req: any, res: Response) => {
  const sig = req.headers['stripe-signature'];
  if (!sig || !env.STRIPE_WEBHOOK_SECRET) throw new ApiError(400, 'Invalid webhook');

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, sig as string, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    throw new ApiError(400, 'Invalid webhook signature');
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status === 'paid') {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const payment = await tx.payment.findFirst({ where: { providerSessionId: session.id } });
        if (!payment || payment.status === 'SUCCESS') return;

        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'SUCCESS', providerPaymentId: session.payment_intent as string, processedAt: new Date() },
        });

        await tx.invoice.update({ where: { id: payment.invoiceId }, data: { status: 'PAID', paidAt: new Date() } });

        const workOrder = await tx.workOrder.findFirst({ where: { invoice: { id: payment.invoiceId } }, include: { assignment: true } });
        if (workOrder) {
          await tx.serviceRequest.update({ where: { id: workOrder.assignment.serviceRequestId }, data: { status: 'CLOSED', closedAt: new Date() } });
        }
      });
    }
  }

  res.status(200).json({ received: true });
});

export const getPaymentById = asyncHandler(async (req: any, res: Response) => {
  const payment = await prisma.payment.findFirst({
    where: { id: req.params.id },
    include: { invoice: { include: { workOrder: { include: { assignment: { include: { serviceRequest: { include: { customer: true } } } } } } } } },
  });

  if (!payment) throw new ApiError(404, 'Payment not found');

  if (req.user!.role === 'CUSTOMER' && payment.customerId !== req.user!.userId) {
    throw new ApiError(403, 'Access denied');
  }

  sendSuccess(res, payment, 'Payment fetched successfully');
});
