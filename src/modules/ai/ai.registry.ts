import { env } from '../../config/env';
import { AIProviderName, AIProviderHealth } from './ai.types';
import { BaseAIProvider } from './providers/base.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { GroqProvider } from './providers/groq.provider';
import { CerebrasProvider } from './providers/cerebras.provider';
import { HuggingFaceProvider } from './providers/huggingface.provider';

export class AIProviderRegistry {
  private static instance: AIProviderRegistry;
  private providers: Map<AIProviderName, BaseAIProvider> = new Map();

  private constructor() {
    this.initializeProviders();
  }

  public static getInstance(): AIProviderRegistry {
    if (!AIProviderRegistry.instance) {
      AIProviderRegistry.instance = new AIProviderRegistry();
    }
    return AIProviderRegistry.instance;
  }

  public initializeProviders(): void {
    const timeout = env.AI_REQUEST_TIMEOUT_MS;
    const maxTokens = env.AI_MAX_OUTPUT_TOKENS;

    const gemini = new GeminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL, timeout, maxTokens);
    const groq = new GroqProvider(env.GROQ_API_KEY, env.GROQ_MODEL, timeout, maxTokens);
    const cerebras = new CerebrasProvider(env.CEREBRAS_API_KEY, env.CEREBRAS_MODEL, timeout, maxTokens);
    const huggingface = new HuggingFaceProvider(
      env.HUGGINGFACE_API_KEY,
      env.HUGGINGFACE_MODEL,
      env.HUGGINGFACE_PROVIDER,
      timeout,
      maxTokens
    );

    this.providers.set('gemini', gemini);
    this.providers.set('groq', groq);
    this.providers.set('cerebras', cerebras);
    this.providers.set('huggingface', huggingface);
  }

  public getProvider(name: AIProviderName): BaseAIProvider | undefined {
    return this.providers.get(name);
  }

  public getAllProviders(): BaseAIProvider[] {
    return Array.from(this.providers.values());
  }

  public getAvailableProviders(): BaseAIProvider[] {
    return this.getAllProviders().filter((p) => p.isAvailable());
  }

  public setProvider(name: AIProviderName, provider: BaseAIProvider): void {
    this.providers.set(name, provider);
  }

  public async checkDiagnostics(): Promise<AIProviderHealth[]> {
    const results: AIProviderHealth[] = [];
    for (const provider of this.getAllProviders()) {
      try {
        const health = await provider.checkHealth();
        results.push(health);
      } catch (err: any) {
        results.push({
          provider: provider.name,
          configured: provider.isConfigured(),
          model: provider.model,
          freeTierEligible: true,
          available: false,
          status: 'NETWORK_ERROR',
          errorReason: err.message,
          consecutiveFailures: provider.getConsecutiveFailures(),
        });
      }
    }
    return results;
  }
}

export const aiRegistry = AIProviderRegistry.getInstance();
