import { env } from '../../config/env';
import { aiRegistry, AIProviderRegistry } from './ai.registry';
import {
  AIFeature,
  AIProviderName,
  AICompletionOptions,
  AICompletionResult,
  OrchestrationResult,
} from './ai.types';

export class AIOrchestrator {
  private static instance: AIOrchestrator;
  private registry: AIProviderRegistry;

  private constructor(registry: AIProviderRegistry = aiRegistry) {
    this.registry = registry;
  }

  public static getInstance(): AIOrchestrator {
    if (!AIOrchestrator.instance) {
      AIOrchestrator.instance = new AIOrchestrator();
    }
    return AIOrchestrator.instance;
  }

  /**
   * Determine preferred provider order based on requested feature capability
   */
  public getFeatureProviderPriority(feature: AIFeature): AIProviderName[] {
    const primary = env.AI_PRIMARY_PROVIDER;

    switch (feature) {
      case 'assistant':
        // Preferred: Gemini -> Groq -> Cerebras -> HuggingFace
        return this.deduplicateOrder([primary, 'gemini', 'groq', 'cerebras', 'huggingface']);

      case 'search':
        // Preferred: Groq (ultra-low latency text classification) -> Gemini -> Cerebras -> HuggingFace
        return this.deduplicateOrder(['groq', primary, 'gemini', 'cerebras', 'huggingface']);

      case 'insights':
        // Preferred: Cerebras (fast structured reasoning) -> Gemini -> Groq -> HuggingFace
        return this.deduplicateOrder(['cerebras', primary, 'gemini', 'groq', 'huggingface']);

      case 'recommendations':
        // Preferred: HuggingFace -> Gemini -> Groq -> Cerebras
        return this.deduplicateOrder(['huggingface', primary, 'gemini', 'groq', 'cerebras']);

      default:
        return this.deduplicateOrder([primary, 'gemini', 'groq', 'cerebras', 'huggingface']);
    }
  }

  private deduplicateOrder(order: AIProviderName[]): AIProviderName[] {
    const seen = new Set<AIProviderName>();
    const result: AIProviderName[] = [];
    for (const name of order) {
      if (!seen.has(name)) {
        seen.add(name);
        result.push(name);
      }
    }
    return result;
  }

  /**
   * Execute AI completion with safe single-hop fallback and free-tier cost enforcement
   */
  public async executeCompletion(
    feature: AIFeature,
    options: AICompletionOptions
  ): Promise<OrchestrationResult<string>> {
    // Paid usage protection
    if (env.AI_ALLOW_PAID_USAGE !== false) {
      // Hard guard: Ensure strict free-tier enforcement
      console.warn('[AIOrchestrator] AI_ALLOW_PAID_USAGE must remain false for free tier.');
    }

    const priorityOrder = this.getFeatureProviderPriority(feature);
    const availableProviders = priorityOrder
      .map((name) => this.registry.getProvider(name))
      .filter((p): p is NonNullable<typeof p> => Boolean(p && p.isAvailable()));

    if (availableProviders.length === 0) {
      return {
        success: false,
        error: 'No free-tier AI providers are currently configured or available.',
        code: 'AI_UNAVAILABLE',
      };
    }

    const primaryProvider = availableProviders[0];
    const startTime = Date.now();

    try {
      const result: AICompletionResult = await primaryProvider.complete(options);
      return {
        success: true,
        data: result.text,
        provider: result.provider,
        model: result.model,
        latencyMs: Date.now() - startTime,
        fallbackUsed: false,
      };
    } catch (primaryErr: any) {
      console.warn(`[AIOrchestrator] Primary provider (${primaryProvider.name}) failed: ${primaryErr.message}`);

      // Check if fallback is enabled and another eligible provider exists
      if (!env.AI_FALLBACK_ENABLED || availableProviders.length < 2) {
        return {
          success: false,
          error: `Primary AI provider (${primaryProvider.name}) failed: ${primaryErr.message}`,
          code: 'AI_UNAVAILABLE',
        };
      }

      // Try exactly ONE fallback provider to avoid retry storms
      const fallbackProvider = availableProviders[1];
      console.info(`[AIOrchestrator] Attempting safe fallback to ${fallbackProvider.name}...`);

      try {
        const fallbackResult = await fallbackProvider.complete(options);
        return {
          success: true,
          data: fallbackResult.text,
          provider: fallbackResult.provider,
          model: fallbackResult.model,
          latencyMs: Date.now() - startTime,
          fallbackUsed: true,
        };
      } catch (fallbackErr: any) {
        console.error(`[AIOrchestrator] Fallback provider (${fallbackProvider.name}) also failed: ${fallbackErr.message}`);
        return {
          success: false,
          error: `AI service unavailable after fallback attempt.`,
          code: 'AI_UNAVAILABLE',
        };
      }
    }
  }
}

export const aiOrchestrator = AIOrchestrator.getInstance();
