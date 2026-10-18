import { BaseAIProvider } from './base.provider';
import { AIProviderName, AICompletionOptions, AICompletionResult, AIProviderHealth } from '../ai.types';

export class HuggingFaceProvider extends BaseAIProvider {
  public readonly name: AIProviderName = 'huggingface';
  public readonly model: string;
  private readonly providerOverride?: string;

  constructor(
    apiKey?: string,
    model: string = 'meta-llama/Llama-3.2-3B-Instruct',
    providerOverride?: string,
    timeoutMs: number = 15000,
    maxOutputTokens: number = 800
  ) {
    super(apiKey, timeoutMs, maxOutputTokens);
    this.model = model;
    this.providerOverride = providerOverride;
  }

  public async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    if (!this.isConfigured()) {
      throw new Error('Hugging Face API key is not configured.');
    }

    const startTime = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || this.timeoutMs);

    try {
      const messages = options.messages.map((m) => ({
        role: m.role,
        content: this.sanitizePrompt(m.content),
      }));

      const bodyPayload: any = {
        model: this.model,
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? this.maxOutputTokens,
      };

      // Hugging Face router v1 chat endpoint
      const endpoint = this.providerOverride
        ? `https://router.huggingface.co/${this.providerOverride}/v1/chat/completions`
        : `https://router.huggingface.co/hf-inference/v1/chat/completions`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(bodyPayload),
        signal: controller.signal,
      });

      const responseText = await response.text();

      if (!response.ok) {
        const classified = this.classifyError(response.status, responseText);
        this.recordFailure(classified.status, classified.message);
        throw new Error(`Hugging Face API error [${response.status}]: ${classified.message}`);
      }

      const json = JSON.parse(responseText);
      const choice = json.choices?.[0];
      const text = choice?.message?.content || (Array.isArray(json) && json[0]?.generated_text) || '';
      const finishReason = choice?.finish_reason;
      const usage = json.usage;

      this.recordSuccess();

      return {
        text: typeof text === 'string' ? text.trim() : JSON.stringify(text),
        provider: this.name,
        model: this.model,
        finishReason,
        promptTokens: usage?.prompt_tokens,
        completionTokens: usage?.completion_tokens,
        latencyMs: Date.now() - startTime,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        this.recordFailure('NETWORK_ERROR', 'Request timed out');
        throw new Error(`Hugging Face request timed out after ${this.timeoutMs}ms.`);
      }
      this.safeLog('Completion error', { error: err.message });
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  public async checkHealth(): Promise<AIProviderHealth> {
    if (!this.isConfigured()) {
      return super.checkHealth();
    }

    try {
      await this.complete({
        messages: [{ role: 'user', content: 'respond with pong' }],
        maxTokens: 5,
        timeoutMs: 6000,
      });
      return {
        provider: this.name,
        configured: true,
        model: this.model,
        freeTierEligible: true,
        available: true,
        status: 'READY',
        lastCheck: new Date().toISOString(),
        consecutiveFailures: 0,
      };
    } catch (err: any) {
      return {
        provider: this.name,
        configured: true,
        model: this.model,
        freeTierEligible: true,
        available: false,
        status: this.lastStatus,
        lastCheck: new Date().toISOString(),
        errorReason: err.message,
        consecutiveFailures: this.consecutiveFailures,
      };
    }
  }
}
