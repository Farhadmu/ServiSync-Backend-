import { BaseAIProvider } from './base.provider';
import { AIProviderName, AICompletionOptions, AICompletionResult, AIProviderHealth } from '../ai.types';

export class GeminiProvider extends BaseAIProvider {
  public readonly name: AIProviderName = 'gemini';
  public readonly model: string;

  constructor(apiKey?: string, model: string = 'gemini-2.5-flash', timeoutMs: number = 15000, maxOutputTokens: number = 800) {
    super(apiKey, timeoutMs, maxOutputTokens);
    this.model = model;
  }

  public async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    if (!this.isConfigured()) {
      throw new Error('Gemini API key is not configured.');
    }

    const startTime = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || this.timeoutMs);

    try {
      // Separate system prompt from conversational contents for Gemini API v1beta
      const systemMessage = options.messages.find((m) => m.role === 'system');
      const conversationMessages = options.messages.filter((m) => m.role !== 'system');

      const contents = conversationMessages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: this.sanitizePrompt(m.content) }],
      }));

      const bodyPayload: any = {
        contents: contents.length > 0 ? contents : [{ role: 'user', parts: [{ text: 'Hello' }] }],
        generationConfig: {
          temperature: options.temperature ?? 0.2,
          maxOutputTokens: options.maxTokens ?? this.maxOutputTokens,
        },
      };

      if (systemMessage) {
        bodyPayload.systemInstruction = {
          parts: [{ text: this.sanitizePrompt(systemMessage.content, 4000) }],
        };
      }

      if (options.responseFormat === 'json') {
        bodyPayload.generationConfig.responseMimeType = 'application/json';
      }

      // Sanitize model name: strip any "models/" prefix or whitespace
      const rawModel = (this.model || 'gemini-2.5-flash').replace(/^models\//, '').trim();

      // Automatically upgrade retired/deprecated Google models (e.g. gemini-1.5-flash, gemini-pro)
      const primaryModel =
        rawModel === 'gemini-1.5-flash' || rawModel === 'gemini-pro' || rawModel === 'gemini-1.0-pro'
          ? 'gemini-2.5-flash'
          : rawModel;

      // Candidate models for seamless automatic fallback if a specific model returns 404
      const candidateModels = Array.from(
        new Set([primaryModel, 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-latest'])
      );

      let lastErrorResponse: { status: number; text: string } | null = null;

      for (let i = 0; i < candidateModels.length; i++) {
        const currentModel = candidateModels[i];
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          currentModel
        )}:generateContent?key=${this.apiKey}`;

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPayload),
          signal: controller.signal,
        });

        const responseText = await response.text();

        if (!response.ok) {
          lastErrorResponse = { status: response.status, text: responseText };
          // If the model is 404 (deprecated or unavailable in this region), try the next candidate model
          if (response.status === 404 && i < candidateModels.length - 1) {
            this.safeLog(`Model '${currentModel}' returned 404. Attempting active alternative '${candidateModels[i + 1]}'`);
            continue;
          }

          const classified = this.classifyError(response.status, responseText);
          this.recordFailure(classified.status, classified.message);
          throw new Error(`Gemini API error [${response.status}]: ${classified.message}`);
        }

        const json = JSON.parse(responseText);
        const candidate = json.candidates?.[0];
        const partText = candidate?.content?.parts?.[0]?.text || '';
        const finishReason = candidate?.finishReason;
        const usage = json.usageMetadata;

        this.recordSuccess();

        return {
          text: partText.trim(),
          provider: this.name,
          model: currentModel,
          finishReason,
          promptTokens: usage?.promptTokenCount,
          completionTokens: usage?.candidatesTokenCount,
          latencyMs: Date.now() - startTime,
        };
      }

      // If loop exited without return
      const classified = this.classifyError(
        lastErrorResponse?.status || 500,
        lastErrorResponse?.text || 'All candidate models failed'
      );
      this.recordFailure(classified.status, classified.message);
      throw new Error(`Gemini API error [${lastErrorResponse?.status || 500}]: ${classified.message}`);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        this.recordFailure('NETWORK_ERROR', 'Request timed out');
        throw new Error(`Gemini request timed out after ${this.timeoutMs}ms.`);
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

    // Perform real lightweight smoke check when API key is configured
    try {
      const res = await this.complete({
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
