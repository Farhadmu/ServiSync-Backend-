import { Router } from 'express';
import { register, login, google, refreshToken, logout } from './auth.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authLimiter } from '../../middlewares/rateLimiter';

const router = Router();

router.use(authLimiter);

router.post('/register', register);
router.post('/login', login);
router.post('/google', google);
router.post('/refresh-token', refreshToken);
router.post('/logout', authenticate, logout);

export default router;
