import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { authService } from './auth.service';
import { registerSchema, loginSchema, refreshTokenSchema } from './auth.validation';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated } from '../../utils/response';
import { authenticate, authorize, RequestUser } from '../../middlewares/authenticate';

export const register = [
  validateRequest({ body: registerSchema }),
  asyncHandler(async (req: any, res: Response, next: NextFunction) => {
    const ip = req.ip;
    const userAgent = req.headers['user-agent'] as string | undefined;
    const result = await authService.register(req.body, ip, userAgent);
    sendCreated(res, result, 'Registration successful');
  }),
];

export const login = [
  validateRequest({ body: loginSchema }),
  asyncHandler(async (req: any, res: Response, next: NextFunction) => {
    const ip = req.ip;
    const userAgent = req.headers['user-agent'] as string | undefined;
    const result = await authService.login(req.body, ip, userAgent);
    sendSuccess(res, result, 'Login successful');
  }),
];

export const google = [
  validateRequest({ body: z.object({ idToken: z.string().min(1, 'idToken is required') }) }),
  asyncHandler(async (req: any, res: Response, next: NextFunction) => {
    const ip = req.ip;
    const userAgent = req.headers['user-agent'] as string | undefined;
    const result = await authService.googleLogin(req.body.idToken, ip, userAgent);
    sendSuccess(res, result, 'Google login successful');
  }),
];

export const refreshToken = [
  validateRequest({ body: refreshTokenSchema }),
  asyncHandler(async (req: any, res: Response, next: NextFunction) => {
    const result = await authService.refreshToken(req.body.refreshToken);
    sendSuccess(res, result, 'Token refreshed successfully');
  }),
];

export const logout = [
  authenticate,
  asyncHandler(async (req: any, res: Response, next: NextFunction) => {
    const refreshToken = req.body.refreshToken;
    await authService.logout(req.user!.userId, refreshToken, req.ip, req.headers['user-agent'] as string | undefined);
    sendSuccess(res, null, 'Logout successful');
  }),
];
