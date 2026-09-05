import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Prisma, Role, CustomerProfile, TechnicianProfile } from '@prisma/client';
import { env } from '../../config/env';
import { generateAccessToken, generateRefreshToken } from '../../utils/jwt';
import type { RequestUser } from '../../utils/jwt';
import { ApiError } from '../../utils/ApiError';
import { createAuditLog, getClientIp } from '../../utils/auditLog';
import { z } from 'zod';
import { prisma as sharedPrisma } from '../../lib/prisma';

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  role: z.enum(['CUSTOMER', 'TECHNICIAN']).optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: 'CUSTOMER' | 'TECHNICIAN' | 'MANAGER' | 'ADMIN';
    image?: string;
  };
}

export class AuthService {
  private prisma = sharedPrisma;

  async register(data: RegisterInput, ip?: string, userAgent?: string): Promise<AuthResponse> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser && !existingUser.deletedAt) {
      throw new ApiError(409, 'User with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(data.password, 12);
    const role = data.role || 'CUSTOMER';

    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        name: data.name,
        role: role as any,
        customerProfile: role === 'CUSTOMER' ? {
          create: { phone: data.phone, address: data.address },
        } : undefined,
        technicianProfile: role === 'TECHNICIAN' ? {
          create: {},
        } : undefined,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        image: true,
        customerProfile: true,
        technicianProfile: true,
      },
    });

    await createAuditLog({
      userId: user.id,
      action: 'USER_REGISTERED',
      entityType: 'USER',
      entityId: user.id,
      newValues: { email: user.email, role: user.role },
      ipAddress: ip,
      userAgent,
    });

    const tokens = this.generateTokens(user.id, user.email, user.role);
    await this.storeRefreshToken(user.id, tokens.refreshToken, ip, userAgent);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role as any,
        image: user.image || undefined,
      },
    };
  }

  async login(data: LoginInput, ip?: string, userAgent?: string): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: data.email },
      include: { customerProfile: true, technicianProfile: true },
    });

    if (!user || user.deletedAt) {
      throw new ApiError(401, 'Invalid email or password');
    }

    if (!user.isActive) {
      throw new ApiError(403, 'Account is deactivated');
    }

    const isPasswordValid = await bcrypt.compare(data.password, user.password || '');
    if (!isPasswordValid) {
      throw new ApiError(401, 'Invalid email or password');
    }

    await createAuditLog({
      userId: user.id,
      action: 'USER_LOGGED_IN',
      entityType: 'USER',
      entityId: user.id,
      ipAddress: ip,
      userAgent,
    });

    const tokens = this.generateTokens(user.id, user.email, user.role);
    await this.storeRefreshToken(user.id, tokens.refreshToken, ip, userAgent);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role as any,
        image: user.image || undefined,
      },
    };
  }

  async logout(userId: string, refreshToken?: string, ip?: string, userAgent?: string) {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: this.hashToken(refreshToken), userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } else {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await createAuditLog({
      userId,
      action: 'USER_LOGGED_OUT',
      entityType: 'USER',
      entityId: userId,
      ipAddress: ip,
      userAgent,
    });
  }

  async refreshToken(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!storedToken || storedToken.revokedAt || new Date() > storedToken.expiresAt) {
      throw new ApiError(401, 'Invalid or expired refresh token');
    }

    if (!storedToken.user || storedToken.user.deletedAt || !storedToken.user.isActive) {
      throw new ApiError(401, 'User not found or deactivated');
    }

    const tokens = this.generateTokens(storedToken.user.id, storedToken.user.email, storedToken.user.role);
    await this.prisma.refreshToken.update({
      where: { tokenHash },
      data: { revokedAt: new Date() },
    });
    await this.storeRefreshToken(storedToken.user.id, tokens.refreshToken);

    return {
      ...tokens,
      user: {
        id: storedToken.user.id,
        email: storedToken.user.email,
        name: storedToken.user.name,
        role: storedToken.user.role as any,
        image: storedToken.user.image || undefined,
      },
    };
  }

  async googleLogin(idToken: string, ip?: string, userAgent?: string): Promise<AuthResponse> {
    const { OAuth2Client } = await import('google-auth-library');
    const client = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);

    const ticket = await client.verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload?.email || !payload?.name) {
      throw new ApiError(400, 'Invalid Google token');
    }

    let user = await this.prisma.user.findUnique({
      where: { email: payload.email },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: payload.email,
          name: payload.name,
          password: await bcrypt.hash(Math.random().toString(36), 12),
          role: 'CUSTOMER',
          isActive: true,
          isEmailVerified: true,
          image: payload.picture || undefined,
          customerProfile: { create: {} },
        },
      });
    } else {
      if (user.deletedAt) {
        throw new ApiError(401, 'Account has been deleted');
      }
      if (!user.isActive) {
        throw new ApiError(403, 'Account is deactivated');
      }
    }

    await createAuditLog({
      userId: user.id,
      action: 'USER_LOGGED_IN',
      entityType: 'USER',
      entityId: user.id,
      ipAddress: ip,
      userAgent,
    });

    const tokens = this.generateTokens(user.id, user.email, user.role);
    await this.storeRefreshToken(user.id, tokens.refreshToken, ip, userAgent);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role as any,
        image: user.image || undefined,
      },
    };
  }

  private generateTokens(userId: string, email: string, role: string) {
    const accessToken = generateAccessToken({ userId, email, role: role as any });
    const refreshToken = generateRefreshToken({ userId, email, role: role as any });
    return { accessToken, refreshToken };
  }

  private async storeRefreshToken(userId: string, token: string, ip?: string, userAgent?: string) {
    const expiresAt = new Date();
    const expiryMs = parseInt(env.REFRESH_TOKEN_EXPIRY) * 24 * 60 * 60 * 1000;
    if (isNaN(expiryMs)) {
      expiresAt.setDate(expiresAt.getDate() + 7);
    } else {
      expiresAt.setTime(expiresAt.getTime() + expiryMs);
    }

    await this.prisma.refreshToken.create({
      data: {
        tokenHash: this.hashToken(token),
        userId,
        ipAddress: ip,
        userAgent,
        expiresAt,
      },
    });
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

export const authService = new AuthService();
