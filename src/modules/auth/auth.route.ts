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
router.get('/seed', async (req, res) => {
  try {
    const { autoSeed } = await import('../../utils/autoSeed');
    await autoSeed();
    res.json({ success: true, message: 'Database successfully seeded with demo accounts and categories' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
