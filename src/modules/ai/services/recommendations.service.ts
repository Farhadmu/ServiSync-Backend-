import prisma from '../../../lib/prisma';
import { aiOrchestrator } from '../ai.orchestrator';
import { OrchestrationResult } from '../ai.types';

export interface RecommendationRequest {
  userId?: string;
  categoryFilter?: string;
  limit?: number;
}

export interface RecommendedServiceItem {
  id: string;
  name: string;
  description: string | null;
  basePrice: number | null;
  durationMinutes: number | null;
  categoryId: string;
  categoryName: string;
  categoryIcon: string | null;
  recommendationReason: string;
  relevanceBasis: 'HISTORY_COMPLEMENTARY' | 'FREQUENTLY_REQUESTED' | 'ESSENTIAL_PREVENTATIVE';
}

export interface RecommendationResponse {
  recommendations: RecommendedServiceItem[];
  basis: string;
  provider?: string;
  model?: string;
  fallbackUsed?: boolean;
}

export class RecommendationsService {
  /**
   * Generates content-based and history-aware recommendations backed by real Prisma catalog records
   */
  public static async getRecommendations(
    req: RecommendationRequest
  ): Promise<OrchestrationResult<RecommendationResponse>> {
    const limit = Math.min(10, Math.max(1, req.limit || 4));
    let pastCategories: string[] = [];
    let pastServiceNames: string[] = [];

    // 1. Fetch authorized past service requests if userId is present
    if (req.userId) {
      try {
        const pastRequests = await prisma.serviceRequest.findMany({
          where: { customerId: req.userId, deletedAt: null },
          select: {
            title: true,
            serviceType: {
              select: {
                id: true,
                name: true,
                categoryId: true,
                category: { select: { name: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        });

        pastCategories = Array.from(new Set(pastRequests.map((r) => r.serviceType.category.name)));
        pastServiceNames = Array.from(new Set(pastRequests.map((r) => r.serviceType.name)));
      } catch (err) {
        pastCategories = [];
        pastServiceNames = [];
      }
    }

    // 2. Fetch candidates from PostgreSQL database
    const allActiveServices = await prisma.serviceType.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ...(req.categoryFilter ? { categoryId: req.categoryFilter } : {}),
      },
      include: {
        category: { select: { id: true, name: true, icon: true } },
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
    });

    if (allActiveServices.length === 0) {
      return {
        success: true,
        data: {
          recommendations: [],
          basis: 'No active services in catalog.',
        },
      };
    }

    // Deterministic ranking
    const scoredServices = allActiveServices.map((service) => {
      let score = 1.0;
      let basis: RecommendedServiceItem['relevanceBasis'] = 'ESSENTIAL_PREVENTATIVE';
      let defaultReason = 'Essential preventative care recommended for home and commercial properties.';

      if (pastCategories.includes(service.category.name)) {
        score += 2.0;
        basis = 'HISTORY_COMPLEMENTARY';
        defaultReason = `Complements your previous ${service.category.name} maintenance work.`;
      } else if (service.durationMinutes && service.durationMinutes <= 60) {
        score += 0.5;
        basis = 'FREQUENTLY_REQUESTED';
        defaultReason = 'High-demand diagnostic and tune-up service with fast dispatch turnaround.';
      }

      return {
        service,
        score,
        basis,
        defaultReason,
      };
    });

    // Sort descending by score
    scoredServices.sort((a, b) => b.score - a.score);
    const topCandidates = scoredServices.slice(0, limit);

    // 3. AI Explanation Generation: ground explanation without inventing fictional metrics
    let providerName: string | undefined;
    let modelName: string | undefined;
    let fallbackUsed = false;
    let aiExplanations: Record<string, string> = {};

    const serviceSummaries = topCandidates
      .map((c, i) => `${i + 1}. [ID: ${c.service.id}] ${c.service.name} (${c.service.category.name})`)
      .join('\n');

    const prompt = `You are ServiSync recommendation engine.
Customer Profile:
- Past Booked Trades: ${pastCategories.length > 0 ? pastCategories.join(', ') : 'New property owner / general browsing'}
- Selected Services:
${serviceSummaries}

Provide a short 1-sentence customer value explanation for each service based on trade best practices (output JSON mapping ID to reason string):
Format:
{
  "${topCandidates[0].service.id}": "One sentence explaining why this service is beneficial to the customer."
}`;

    const aiRes = await aiOrchestrator.executeCompletion('recommendations', {
      messages: [
        { role: 'system', content: 'You are a service recommendation assistant. Output JSON only.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      maxTokens: 350,
      responseFormat: 'json',
    });

    if (aiRes.success && aiRes.data) {
      try {
        aiExplanations = JSON.parse(aiRes.data);
        providerName = aiRes.provider;
        modelName = aiRes.model;
        fallbackUsed = Boolean(aiRes.fallbackUsed);
      } catch {
        aiExplanations = {};
      }
    }

    const recommendations: RecommendedServiceItem[] = topCandidates.map((c) => ({
      id: c.service.id,
      name: c.service.name,
      description: c.service.description,
      basePrice: c.service.basePrice ? Number(c.service.basePrice) : null,
      durationMinutes: c.service.durationMinutes,
      categoryId: c.service.categoryId,
      categoryName: c.service.category.name,
      categoryIcon: c.service.category.icon,
      recommendationReason: aiExplanations[c.service.id] || c.defaultReason,
      relevanceBasis: c.basis,
    }));

    return {
      success: true,
      data: {
        recommendations,
        basis:
          pastCategories.length > 0
            ? `Personalized from your previous ${pastCategories.join(' & ')} history.`
            : 'Curated preventative care and high-demand platform repairs.',
        provider: providerName,
        model: modelName,
        fallbackUsed,
      },
      provider: providerName as any,
      model: modelName,
      fallbackUsed,
    };
  }
}
