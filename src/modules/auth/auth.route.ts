import { Router } from 'express';
import { register, login, google, refreshToken, logout } from './auth.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authLimiter } from '../../middlewares/rateLimiter';

const router = Router();

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/google', authLimiter, google);
router.post('/refresh-token', refreshToken);
router.post('/logout', authenticate, logout);
router.get('/seed', async (req, res) => {
  try {
    const { autoSeed } = await import('../../utils/autoSeed');
    await autoSeed(true);
    res.json({ success: true, message: 'Database successfully seeded with demo accounts, technicians, and categories' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
