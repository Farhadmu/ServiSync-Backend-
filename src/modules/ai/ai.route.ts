import { Router } from 'express';
import {
  postAssistantChat,
  getSmartSearch,
  getRecommendations,
  getManagerInsights,
  getAIHealth,
} from './ai.controller';
import { authenticate, authorize, optionalAuthenticate } from '../../middlewares/authenticate';
import { aiLimiter } from '../../middlewares/rateLimiter';

const router = Router();

// ── Public AI Endpoints (Protected by IP Rate Limiter) ───────────────────────
router.post('/assistant', aiLimiter, optionalAuthenticate, postAssistantChat);
router.get('/search', aiLimiter, getSmartSearch);
router.get('/recommendations', aiLimiter, optionalAuthenticate, getRecommendations);
router.get('/health', getAIHealth);

// ── Manager/Admin Operational Insights ───────────────────────────────────────
router.get(
  '/manager-insights',
  authenticate,
  authorize('MANAGER', 'ADMIN'),
  aiLimiter,
  getManagerInsights
);

export default router;
