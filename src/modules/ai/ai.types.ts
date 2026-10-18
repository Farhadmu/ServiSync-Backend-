export type AIProviderName = 'gemini' | 'groq' | 'cerebras' | 'huggingface';

export type AIFeature = 'assistant' | 'search' | 'recommendations' | 'insights';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionOptions {
  messages: AIMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  responseFormat?: 'text' | 'json';
}

export interface AICompletionResult {
  text: string;
  provider: AIProviderName;
  model: string;
  finishReason?: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs: number;
}

export type AIProviderStatus =
  | 'READY'
  | 'MISSING_API_KEY'
  | 'QUOTA_EXHAUSTED'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'DISABLED';

export interface AIProviderHealth {
  provider: AIProviderName;
  configured: boolean;
  model: string;
  freeTierEligible: boolean;
  available: boolean;
  status: AIProviderStatus;
  lastCheck?: string;
  errorReason?: string;
  consecutiveFailures: number;
}

export interface AIProvider {
  readonly name: AIProviderName;
  readonly model: string;
  isConfigured(): boolean;
  isAvailable(): boolean;
  complete(options: AICompletionOptions): Promise<AICompletionResult>;
  checkHealth(): Promise<AIProviderHealth>;
}

export interface OrchestrationResult<T = string> {
  success: boolean;
  data?: T;
  provider?: AIProviderName;
  model?: string;
  latencyMs?: number;
  fallbackUsed?: boolean;
  error?: string;
  code?: 'AI_UNAVAILABLE' | 'QUOTA_EXHAUSTED' | 'TIMEOUT' | 'BAD_REQUEST' | 'RATE_LIMITED';
}
