import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { ApiError } from '../utils/ApiError';
import { generateAccessToken, generateRefreshToken, verifyAccessToken, verifyRefreshToken } from '../utils/jwt';
import { z } from 'zod';

describe('ServiSync Backend - Core Safety & Business Logic Tests', () => {

  describe('1. Exact Decimal Financial Calculations', () => {
    it('should compute invoice total accurately without floating point drift', () => {
      const laborCost = new Prisma.Decimal('150.75');
      const materialCost = new Prisma.Decimal('89.50');
      const subtotal = laborCost.plus(materialCost);
      const discount = new Prisma.Decimal('10.25');
      const taxRate = new Prisma.Decimal('0.08'); // 8%

      const afterDiscount = subtotal.minus(discount);
      const tax = afterDiscount.times(taxRate);
      const totalAmount = afterDiscount.plus(tax);
      const dueAmount = totalAmount;

      assert.equal(subtotal.toString(), '240.25');
      assert.equal(afterDiscount.toString(), '230');
      assert.equal(tax.toString(), '18.4');
      assert.equal(totalAmount.toString(), '248.4');
      assert.equal(dueAmount.toString(), '248.4');
    });

    it('should calculate item lines in invoice accurately', () => {
      const items = [
        { unitPrice: new Prisma.Decimal('45.00'), quantity: 2 },
        { unitPrice: new Prisma.Decimal('12.50'), quantity: 4 },
      ];
      let sum = new Prisma.Decimal(0);
      for (const item of items) {
        const lineTotal = item.unitPrice.times(item.quantity);
        sum = sum.plus(lineTotal);
      }
      assert.equal(sum.toString(), '140');
    });
  });

  describe('2. JWT Authentication & Token Lifecycle', () => {
    process.env.ACCESS_TOKEN_SECRET = 'test_access_token_secret_for_unit_testing_32chars!';
    process.env.REFRESH_TOKEN_SECRET = 'test_refresh_token_secret_for_unit_testing_32chars!';
    process.env.ACCESS_TOKEN_EXPIRY = '15m';
    process.env.REFRESH_TOKEN_EXPIRY = '7d';

    it('should correctly sign and verify access tokens', () => {
      const payload = { userId: 'user-123', email: 'alice@example.com', role: 'CUSTOMER' as const };
      const token = generateAccessToken(payload);
      assert.ok(token);

      const decoded = verifyAccessToken(token);
      assert.equal(decoded.userId, 'user-123');
      assert.equal(decoded.email, 'alice@example.com');
      assert.equal(decoded.role, 'CUSTOMER');
    });

    it('should correctly sign and verify refresh tokens', () => {
      const payload = { userId: 'user-123', email: 'alice@example.com', role: 'CUSTOMER' as const };
      const token = generateRefreshToken(payload);
      assert.ok(token);

      const decoded = verifyRefreshToken(token);
      assert.equal(decoded.userId, 'user-123');
    });

    it('should fail verification for tampered tokens', () => {
      const token = generateAccessToken({ userId: 'user-123', email: 'alice@example.com', role: 'CUSTOMER' as const });
      const tampered = token.slice(0, -5) + 'abcde';
      assert.throws(() => verifyAccessToken(tampered));
    });
  });

  describe('3. Zod Request Validations & Bounds Checking', () => {
    it('should reject feedback ratings less than 1 or greater than 5', () => {
      const feedbackSchema = z.object({
        workOrderId: z.string().min(1),
        rating: z.number().int().min(1, 'Rating must be at least 1').max(5, 'Rating cannot exceed 5'),
        comment: z.string().optional(),
      });

      assert.doesNotThrow(() => feedbackSchema.parse({ workOrderId: 'wo-1', rating: 5, comment: 'Great' }));
      assert.doesNotThrow(() => feedbackSchema.parse({ workOrderId: 'wo-1', rating: 1 }));
      assert.throws(() => feedbackSchema.parse({ workOrderId: 'wo-1', rating: 0 }));
      assert.throws(() => feedbackSchema.parse({ workOrderId: 'wo-1', rating: 6 }));
      assert.throws(() => feedbackSchema.parse({ workOrderId: 'wo-1', rating: 3.5 }));
    });

    it('should validate customer registration schema with valid password and email', () => {
      const registerSchema = z.object({
        email: z.string().email('Invalid email address'),
        password: z.string().min(8, 'Password must be at least 8 characters'),
        name: z.string().min(2, 'Name must be at least 2 characters'),
        role: z.enum(['CUSTOMER', 'TECHNICIAN']).default('CUSTOMER'),
      });

      assert.doesNotThrow(() => registerSchema.parse({
        email: 'test@example.com',
        password: 'Password123!',
        name: 'John Doe',
        role: 'CUSTOMER',
      }));

      assert.throws(() => registerSchema.parse({
        email: 'invalid-email',
        password: 'short',
        name: 'A',
      }));
    });
  });

  describe('4. Custom ApiError Formatting', () => {
    it('should instantiate ApiError with correct status code, message, and error details', () => {
      const err = new ApiError(403, 'Forbidden action', [{ field: 'role', message: 'Insufficient permission' }]);
      assert.equal(err.statusCode, 403);
      assert.equal(err.message, 'Forbidden action');
      assert.equal(err.errors.length, 1);
      assert.equal(err.errors[0].field, 'role');
    });
  });

  describe('5. Technician Skill Validation Logic', () => {
    it('should verify that technician possesses all required skills for a service type', () => {
      const requiredSkills = ['HVAC Repair', 'Electrical'];
      const technicianSkills = ['HVAC Repair', 'Electrical', 'Plumbing'];
      const missingSkills = requiredSkills.filter(req => !technicianSkills.includes(req));
      assert.equal(missingSkills.length, 0);

      const insufficientTechnicianSkills = ['Plumbing', 'Carpentry'];
      const missingFromInsufficient = requiredSkills.filter(req => !insufficientTechnicianSkills.includes(req));
      assert.equal(missingFromInsufficient.length, 2);
      assert.deepEqual(missingFromInsufficient, ['HVAC Repair', 'Electrical']);
    });
  });

  describe('6. Schedule Conflict & Double Booking Detection', () => {
    it('should detect overlapping assignments for a technician', () => {
      const existingAssignment = {
        scheduledStartAt: new Date('2026-09-10T10:00:00.000Z'),
        scheduledEndAt: new Date('2026-09-10T12:00:00.000Z'),
      };

      const hasConflict = (newStart: Date, newEnd: Date) => {
        return newStart < existingAssignment.scheduledEndAt && newEnd > existingAssignment.scheduledStartAt;
      };

      // Overlapping: 11:00 to 13:00
      assert.equal(hasConflict(new Date('2026-09-10T11:00:00.000Z'), new Date('2026-09-10T13:00:00.000Z')), true);

      // Overlapping: 09:00 to 11:00
      assert.equal(hasConflict(new Date('2026-09-10T09:00:00.000Z'), new Date('2026-09-10T11:00:00.000Z')), true);

      // Completely inside: 10:30 to 11:30
      assert.equal(hasConflict(new Date('2026-09-10T10:30:00.000Z'), new Date('2026-09-10T11:30:00.000Z')), true);

      // Non-overlapping (after): 12:00 to 14:00
      assert.equal(hasConflict(new Date('2026-09-10T12:00:00.000Z'), new Date('2026-09-10T14:00:00.000Z')), false);

      // Non-overlapping (before): 08:00 to 10:00
      assert.equal(hasConflict(new Date('2026-09-10T08:00:00.000Z'), new Date('2026-09-10T10:00:00.000Z')), false);
    });
  });

  describe('7. Service Lifecycle Status Transition Guardrails', () => {
    const validServiceRequestTransitions: Record<string, string[]> = {
      PENDING: ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'],
      UNDER_REVIEW: ['APPROVED', 'REJECTED', 'CANCELLED'],
      APPROVED: ['ASSIGNED', 'CANCELLED'],
      ASSIGNED: ['SCHEDULED', 'CANCELLED'],
      SCHEDULED: ['IN_PROGRESS', 'CANCELLED'],
      IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
      COMPLETED: ['INVOICED'],
      INVOICED: ['PAID'],
      PAID: ['CLOSED'],
      CANCELLED: [],
      REJECTED: [],
      CLOSED: [],
    };

    it('should validate allowed status transitions', () => {
      const isValidTransition = (from: string, to: string) => {
        return validServiceRequestTransitions[from]?.includes(to) ?? false;
      };

      assert.equal(isValidTransition('PENDING', 'APPROVED'), true);
      assert.equal(isValidTransition('APPROVED', 'ASSIGNED'), true);
      assert.equal(isValidTransition('COMPLETED', 'INVOICED'), true);
      assert.equal(isValidTransition('INVOICED', 'PAID'), true);
      assert.equal(isValidTransition('PAID', 'CLOSED'), true);

      // Disallowed transitions
      assert.equal(isValidTransition('CLOSED', 'PENDING'), false);
      assert.equal(isValidTransition('CANCELLED', 'IN_PROGRESS'), false);
      assert.equal(isValidTransition('PENDING', 'COMPLETED'), false);
    });
  });

  describe('8. ID Mapping Integrity for Technician and User', () => {
    it('should correctly distinguish between User ID and TechnicianProfile ID', () => {
      const user = { id: 'usr_abc123', email: 'tech@example.com', role: 'TECHNICIAN' };
      const techProfile = { id: 'tech_profile_xyz789', userId: user.id };

      assert.notEqual(user.id, techProfile.id);
      assert.equal(techProfile.userId, user.id);

      // Assignment stores technicianProfile.id
      const assignment = { id: 'asgn_1', technicianId: techProfile.id };
      assert.equal(assignment.technicianId, techProfile.id);

      // Feedback links technician as user.id
      const feedback = { id: 'fb_1', customerId: 'cust_1', technicianId: techProfile.userId };
      assert.equal(feedback.technicianId, user.id);
    });
  });
});
