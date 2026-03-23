/**
 * LLM Provider factory.
 * OpenAI first. Add Anthropic by creating providers/anthropic.ts and adding a case here.
 */

import type { LLMProvider, LLMProviderConfig } from './types.js';
import { OpenAIProvider } from './openai.js';

export type ProviderName = 'openai';

export function createProvider(
  name: ProviderName,
  config: LLMProviderConfig
): LLMProvider {
  switch (name) {
    case 'openai':
      return new OpenAIProvider(config);
    default:
      throw new Error(`Unknown provider: ${name}. Available: openai`);
  }
}
