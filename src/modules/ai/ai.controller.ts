import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/response';
import { ApiError } from '../../utils/ApiError';
import { aiRegistry } from './ai.registry';
import { AssistantService } from './services/assistant.service';
import { SearchService } from './services/search.service';
import { RecommendationsService } from './services/recommendations.service';
import { InsightsService } from './services/insights.service';

export const assistantChatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1, 'Message content cannot be empty').max(2000, 'Message too long'),
      })
    )
    .min(1, 'At least one message is required'),
  context: z
    .object({
      currentCategory: z.string().optional(),
      userRole: z.string().optional(),
    })
    .optional(),
});

export const smartSearchSchema = z.object({
  q: z.string().optional().default(''),
  categoryId: z.string().optional(),
  limit: z.coerce.number().min(1).max(25).optional().default(10),
});

export const recommendationsSchema = z.object({
  categoryFilter: z.string().optional(),
  limit: z.coerce.number().min(1).max(10).optional().default(4),
});

/**
 * AI Service Assistant - Interactive Chat
 */
export const postAssistantChat = asyncHandler(async (req: any, res: Response) => {
  const parsed = assistantChatSchema.parse(req.body);
  const result = await AssistantService.handleChat({
    messages: parsed.messages,
    context: {
      ...parsed.context,
      userRole: req.user?.role,
    },
  });

  if (!result.success) {
    // Graceful response without throwing 500 when AI providers are unavailable
    return res.status(200).json({
      success: false,
      message: result.error || 'AI Assistant is currently unavailable.',
      code: result.code || 'AI_UNAVAILABLE',
      data: {
        reply:
          "I'm currently unable to connect to the AI model. You can still browse our live services, request a booking directly, or contact our support team.",
        actionLinks: [
          { title: 'Live Booking', url: '/#instant-booking' },
          { title: 'Service Catalog', url: '/#services' },
          { title: 'Help Center', url: '/help' },
        ],
      },
    });
  }

  sendSuccess(res, result.data, 'AI assistant response generated successfully');
});

/**
 * Smart Service Search - Hybrid DB + Semantic Query Understanding
 */
export const getSmartSearch = asyncHandler(async (req: any, res: Response) => {
  const query = smartSearchSchema.parse(req.query);
  const result = await SearchService.searchServices({
    query: query.q,
    categoryId: query.categoryId,
    limit: query.limit,
  });

  sendSuccess(res, result.data, 'Smart search executed successfully');
});

/**
 * Personalized Service Recommendations
 */
export const getRecommendations = asyncHandler(async (req: any, res: Response) => {
  const query = recommendationsSchema.parse(req.query);
  const userId = req.user?.userId;

  const result = await RecommendationsService.getRecommendations({
    userId,
    categoryFilter: query.categoryFilter,
    limit: query.limit,
  });

  sendSuccess(res, result.data, 'Service recommendations fetched successfully');
});

/**
 * Manager Operational Insights (Manager/Admin Only)
 */
export const getManagerInsights = asyncHandler(async (_req: any, res: Response) => {
  const result = await InsightsService.generateInsights();
  sendSuccess(res, result.data, 'Manager operational insights generated successfully');
});

/**
 * AI Diagnostics & Provider Health
 */
export const getAIHealth = asyncHandler(async (_req: any, res: Response) => {
  const diagnostics = await aiRegistry.checkDiagnostics();
  const availableCount = diagnostics.filter((d) => d.available).length;

  sendSuccess(
    res,
    {
      overallStatus: availableCount > 0 ? 'OPERATIONAL' : 'DEGRADED',
      availableProvidersCount: availableCount,
      totalProvidersCount: diagnostics.length,
      providers: diagnostics,
    },
    'AI provider diagnostics retrieved successfully'
  );
});
