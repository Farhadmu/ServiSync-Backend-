import {
  AIProvider,
  AIProviderName,
  AICompletionOptions,
  AICompletionResult,
  AIProviderHealth,
  AIProviderStatus,
} from '../ai.types';

export abstract class BaseAIProvider implements AIProvider {
  abstract readonly name: AIProviderName;
  abstract readonly model: string;

  protected apiKey?: string;
  protected timeoutMs: number;
  protected maxOutputTokens: number;
  protected consecutiveFailures: number = 0;
  protected quotaExhaustedUntil: number | null = null;
  protected lastStatus: AIProviderStatus = 'READY';
  protected lastErrorReason?: string;
  protected lastCheckTime?: string;

  constructor(apiKey?: string, timeoutMs: number = 15000, maxOutputTokens: number = 800) {
    this.apiKey = apiKey && apiKey.trim().length > 0 ? apiKey.trim() : undefined;
    this.timeoutMs = timeoutMs;
    this.maxOutputTokens = maxOutputTokens;
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.length > 5);
  }

  public isAvailable(): boolean {
    if (!this.isConfigured()) return false;
    if (this.quotaExhaustedUntil && Date.now() < this.quotaExhaustedUntil) {
      return false;
    }
    // Auto-reset quota exhaustion when cool-down expires
    if (this.quotaExhaustedUntil && Date.now() >= this.quotaExhaustedUntil) {
      this.quotaExhaustedUntil = null;
      this.lastStatus = 'READY';
      this.consecutiveFailures = 0;
    }
    return this.consecutiveFailures < 5;
  }

  public getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  public recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.quotaExhaustedUntil = null;
    this.lastStatus = 'READY';
    this.lastErrorReason = undefined;
    this.lastCheckTime = new Date().toISOString();
  }

  public recordFailure(status: AIProviderStatus, reason: string): void {
    this.consecutiveFailures += 1;
    this.lastStatus = status;
    this.lastErrorReason = reason;
    this.lastCheckTime = new Date().toISOString();

    if (status === 'QUOTA_EXHAUSTED') {
      // 10-minute cool-down for quota exhaustion to protect free tier
      this.quotaExhaustedUntil = Date.now() + 10 * 60 * 1000;
    } else if (status === 'RATE_LIMITED') {
      // 1-minute cool-down for rate limit bursts
      this.quotaExhaustedUntil = Date.now() + 60 * 1000;
    }
  }

  public classifyError(statusCode: number, responseBody: string): { status: AIProviderStatus; message: string } {
    const lower = (responseBody || '').toLowerCase();
    if (statusCode === 429 || lower.includes('quota') || lower.includes('resource_exhausted') || lower.includes('credit')) {
      return { status: 'QUOTA_EXHAUSTED', message: 'Provider free quota or rate limit exceeded.' };
    }
    if (statusCode === 401 || statusCode === 403 || lower.includes('unauthorized') || lower.includes('invalid_api_key')) {
      return { status: 'MISSING_API_KEY', message: 'Invalid or unauthorized API key.' };
    }
    if (statusCode === 408 || lower.includes('timeout') || lower.includes('timed out')) {
      return { status: 'NETWORK_ERROR', message: 'Provider request timed out.' };
    }
    return { status: 'NETWORK_ERROR', message: `Provider error (${statusCode}): ${responseBody.slice(0, 150)}` };
  }

  public sanitizePrompt(input: string, maxLen: number = 2000): string {
    if (!input) return '';
    let sanitized = input.trim();
    // Neutralize typical prompt injection override attempts
    sanitized = sanitized.replace(/ignore\s+(all\s+)?(previous|above|prior)\s+instructions/gi, '[filtered]');
    sanitized = sanitized.replace(/system\s*:\s*/gi, 'user-note: ');
    sanitized = sanitized.replace(/```(system|admin)/gi, '```');
    if (sanitized.length > maxLen) {
      sanitized = sanitized.slice(0, maxLen) + '... [truncated]';
    }
    return sanitized;
  }

  public safeLog(message: string, meta?: Record<string, any>): void {
    const sanitizedMeta = meta ? { ...meta } : {};
    // Ensure keys and tokens are never logged
    ['apiKey', 'key', 'token', 'authorization', 'secret'].forEach((k) => {
      if (sanitizedMeta[k]) sanitizedMeta[k] = '[REDACTED]';
    });
    // In production or tests, keep logs clean
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[AI-Provider:${this.name}] ${message}`, Object.keys(sanitizedMeta).length ? sanitizedMeta : '');
    }
  }

  public abstract complete(options: AICompletionOptions): Promise<AICompletionResult>;

  public async checkHealth(): Promise<AIProviderHealth> {
    const configured = this.isConfigured();
    const available = this.isAvailable();
    return {
      provider: this.name,
      configured,
      model: this.model,
      freeTierEligible: true,
      available,
      status: !configured ? 'MISSING_API_KEY' : this.lastStatus,
      lastCheck: this.lastCheckTime || new Date().toISOString(),
      errorReason: this.lastErrorReason,
      consecutiveFailures: this.consecutiveFailures,
    };
  }
}
