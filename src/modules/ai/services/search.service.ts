import { Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { aiOrchestrator } from '../ai.orchestrator';
import { OrchestrationResult } from '../ai.types';

export interface SmartSearchRequest {
  query: string;
  categoryId?: string;
  limit?: number;
}

export interface InterpretedQuery {
  keywords: string[];
  suggestedCategory?: string;
  intent: string;
  confidence: number;
}

export interface SmartSearchResultItem {
  id: string;
  name: string;
  description: string | null;
  basePrice: number | null;
  durationMinutes: number | null;
  categoryId: string;
  categoryName: string;
  categoryIcon: string | null;
  relevanceScore: number;
  matchReason?: string;
}

export interface SmartSearchResponse {
  results: SmartSearchResultItem[];
  total: number;
  query: string;
  interpretation?: InterpretedQuery;
  provider?: string;
  model?: string;
  fallbackUsed?: boolean;
}

export class SearchService {
  /**
   * Deterministic local query intent extraction for instant debounced typing
   */
  public static extractFastIntent(query: string): { keywords: string[]; cleanQuery: string } {
    const stopWords = new Set(['i', 'need', 'a', 'to', 'fix', 'my', 'the', 'is', 'in', 'for', 'broken', 'having', 'some']);
    const tokens = query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !stopWords.has(w));

    return {
      keywords: tokens.slice(0, 5),
      cleanQuery: query.trim(),
    };
  }

  /**
   * Performs hybrid smart search:
   * 1. Direct Prisma search for fast baseline matches
   * 2. When query is complex/conversational, calls AI to understand intent & extract category/synonyms
   * 3. Executes safe Prisma parameterized lookup and content-based ranking
   */
  public static async searchServices(
    req: SmartSearchRequest
  ): Promise<OrchestrationResult<SmartSearchResponse>> {
    const rawQuery = (req.query || '').trim();
    const limit = Math.min(25, Math.max(1, req.limit || 10));

    if (!rawQuery) {
      // Empty query returns default top active services
      const services = await prisma.serviceType.findMany({
        where: { deletedAt: null, isActive: true, ...(req.categoryId ? { categoryId: req.categoryId } : {}) },
        include: { category: { select: { id: true, name: true, icon: true } } },
        take: limit,
        orderBy: { name: 'asc' },
      });

      return {
        success: true,
        data: {
          results: services.map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            basePrice: s.basePrice ? Number(s.basePrice) : null,
            durationMinutes: s.durationMinutes,
            categoryId: s.categoryId,
            categoryName: s.category.name,
            categoryIcon: s.category.icon,
            relevanceScore: 1.0,
            matchReason: 'Active catalog item',
          })),
          total: services.length,
          query: '',
        },
      };
    }

    // 1. Direct database filter using PostgreSQL case-insensitive search
    const directMatches = await prisma.serviceType.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ...(req.categoryId ? { categoryId: req.categoryId } : {}),
        OR: [
          { name: { contains: rawQuery, mode: 'insensitive' } },
          { description: { contains: rawQuery, mode: 'insensitive' } },
          { category: { name: { contains: rawQuery, mode: 'insensitive' } } },
        ],
      },
      include: { category: { select: { id: true, name: true, icon: true } } },
      take: limit,
    });

    let interpretation: InterpretedQuery | undefined;
    let providerName: string | undefined;
    let modelName: string | undefined;
    let fallbackUsed = false;

    // 2. If conversational query (> 3 words) or few direct matches, invoke AI query interpreter
    const isConversational = rawQuery.split(/\s+/).length >= 3;

    if (isConversational || directMatches.length === 0) {
      const prompt = `Interpret this customer repair/service search query and output STRICT JSON only:
Query: "${rawQuery.replace(/"/g, '')}"

Output JSON format:
{
  "keywords": ["2-4 relevant trade keywords/synonyms"],
  "suggestedCategory": "one of: HVAC, Plumbing, Electrical, Security, Appliance, Cleaning, General Maintenance",
  "intent": "brief summary of user's core problem",
  "confidence": 0.95
}`;

      const aiRes = await aiOrchestrator.executeCompletion('search', {
        messages: [
          { role: 'system', content: 'You are an intelligent search intent extractor. Output valid JSON only.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        maxTokens: 250,
        responseFormat: 'json',
      });

      if (aiRes.success && aiRes.data) {
        try {
          const parsed = JSON.parse(aiRes.data);
          interpretation = {
            keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
            suggestedCategory: parsed.suggestedCategory,
            intent: parsed.intent || rawQuery,
            confidence: Number(parsed.confidence) || 0.85,
          };
          providerName = aiRes.provider;
          modelName = aiRes.model;
          fallbackUsed = Boolean(aiRes.fallbackUsed);
        } catch {
          // If JSON parse fails, fallback to fast token extraction
          const fast = this.extractFastIntent(rawQuery);
          interpretation = {
            keywords: fast.keywords,
            intent: rawQuery,
            confidence: 0.7,
          };
        }
      }
    }

    // 3. Build expanded safe search query if AI returned keywords/category
    let combinedItems = [...directMatches];

    if (interpretation && (interpretation.keywords.length > 0 || interpretation.suggestedCategory)) {
      const orConditions: Prisma.ServiceTypeWhereInput[] = [];

      if (interpretation.suggestedCategory) {
        orConditions.push({
          category: { name: { contains: interpretation.suggestedCategory, mode: 'insensitive' } },
        });
      }

      for (const kw of interpretation.keywords) {
        if (kw.length > 2) {
          orConditions.push({ name: { contains: kw, mode: 'insensitive' } });
          orConditions.push({ description: { contains: kw, mode: 'insensitive' } });
        }
      }

      if (orConditions.length > 0) {
        const semanticMatches = await prisma.serviceType.findMany({
          where: {
            deletedAt: null,
            isActive: true,
            ...(req.categoryId ? { categoryId: req.categoryId } : {}),
            OR: orConditions,
          },
          include: { category: { select: { id: true, name: true, icon: true } } },
          take: limit,
        });

        // Deduplicate with direct matches by ID
        const existingIds = new Set(combinedItems.map((item) => item.id));
        for (const s of semanticMatches) {
          if (!existingIds.has(s.id)) {
            combinedItems.push(s);
            existingIds.add(s.id);
          }
        }
      }
    }

    const formattedResults: SmartSearchResultItem[] = combinedItems.slice(0, limit).map((s) => {
      const isDirect = directMatches.some((d) => d.id === s.id);
      return {
        id: s.id,
        name: s.name,
        description: s.description,
        basePrice: s.basePrice ? Number(s.basePrice) : null,
        durationMinutes: s.durationMinutes,
        categoryId: s.categoryId,
        categoryName: s.category.name,
        categoryIcon: s.category.icon,
        relevanceScore: isDirect ? 1.0 : 0.85,
        matchReason: isDirect
          ? 'Direct keyword match'
          : interpretation?.intent
          ? `Matched trade intent: ${interpretation.intent}`
          : 'Category match',
      };
    });

    return {
      success: true,
      data: {
        results: formattedResults,
        total: formattedResults.length,
        query: rawQuery,
        interpretation,
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
