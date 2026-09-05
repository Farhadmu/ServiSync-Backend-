import { Router } from 'express';
import { register, login, google, refreshToken, logout } from './auth.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authLimiter } from '../../middlewares/rateLimiter';

const router = Router();

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/google', authLimiter, google);
router.post('/refresh-token', authLimiter, refreshToken);
router.post('/logout', authenticate, logout);

export default router;
