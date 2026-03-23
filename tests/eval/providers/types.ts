/**
 * LLM Provider abstraction for eval harness.
 * Pluggable interface — OpenAI first, Anthropic later.
 */

export interface OpenAIFunctionTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export interface LLMToolCall {
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface LLMProviderResponse {
  toolCalls: LLMToolCall[];
  rawResponse?: unknown;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs: number;
}

export interface LLMProviderConfig {
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  baseURL?: string;
}

export interface LLMProvider {
  readonly name: string;

  chat(params: {
    messages: ChatMessage[];
    tools: OpenAIFunctionTool[];
  }): Promise<LLMProviderResponse>;
}
