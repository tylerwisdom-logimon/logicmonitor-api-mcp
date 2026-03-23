/**
 * OpenAI LLM provider for eval harness.
 * Uses chat.completions.create with function calling (tools).
 */

import OpenAI from 'openai';
import type {
  LLMProvider,
  LLMProviderConfig,
  LLMProviderResponse,
  ChatMessage,
  OpenAIFunctionTool,
} from './types.js';

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  private client: OpenAI;
  private model: string;
  private temperature: number;
  private maxTokens: number;

  constructor(config: LLMProviderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
    this.model = config.model;
    this.temperature = config.temperature ?? 0;
    this.maxTokens = config.maxTokens ?? 1024;
  }

  async chat(params: {
    messages: ChatMessage[];
    tools: OpenAIFunctionTool[];
  }): Promise<LLMProviderResponse> {
    const startMs = Date.now();

    // Convert our ChatMessage format to OpenAI's format
    const messages = params.messages.map(msg => {
      if (msg.role === 'tool') {
        return {
          role: 'tool' as const,
          content: msg.content ?? '',
          tool_call_id: msg.tool_call_id ?? '',
        };
      }
      if (msg.role === 'assistant' && msg.tool_calls) {
        return {
          role: 'assistant' as const,
          content: msg.content ?? null,
          tool_calls: msg.tool_calls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: tc.function,
          })),
        };
      }
      return {
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content ?? '',
      };
    });

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      tools: params.tools.map(t => ({
        type: 'function' as const,
        function: {
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        },
      })),
      tool_choice: 'auto',
      temperature: this.temperature,
      max_completion_tokens: this.maxTokens,
    });

    const latencyMs = Date.now() - startMs;
    const choice = response.choices[0];
    const toolCalls = (choice?.message?.tool_calls ?? []).map(tc => ({
      toolName: tc.function.name,
      arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    }));

    return {
      toolCalls,
      rawResponse: response,
      model: response.model,
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
      latencyMs,
    };
  }
}
