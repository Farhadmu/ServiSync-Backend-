import { BaseAIProvider } from './base.provider';
import { AIProviderName, AICompletionOptions, AICompletionResult, AIProviderHealth } from '../ai.types';

export class CerebrasProvider extends BaseAIProvider {
  public readonly name: AIProviderName = 'cerebras';
  public readonly model: string;

  constructor(apiKey?: string, model: string = 'llama3.1-8b', timeoutMs: number = 15000, maxOutputTokens: number = 800) {
    super(apiKey, timeoutMs, maxOutputTokens);
    this.model = model;
  }

  public async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    if (!this.isConfigured()) {
      throw new Error('Cerebras API key is not configured.');
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

      if (options.responseFormat === 'json') {
        bodyPayload.response_format = { type: 'json_object' };
      }

      const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
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
        throw new Error(`Cerebras API error [${response.status}]: ${classified.message}`);
      }

      const json = JSON.parse(responseText);
      const choice = json.choices?.[0];
      const text = choice?.message?.content || '';
      const finishReason = choice?.finish_reason;
      const usage = json.usage;

      this.recordSuccess();

      return {
        text: text.trim(),
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
        throw new Error(`Cerebras request timed out after ${this.timeoutMs}ms.`);
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
