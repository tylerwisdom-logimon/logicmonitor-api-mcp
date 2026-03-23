/**
 * Scoring types for LLM eval harness.
 */

import type { LLMProviderResponse } from '../providers/types.js';

// --- Scenario types ---

export type ArgumentMatcher =
  | { exact: unknown }
  | { contains: string }
  | { pattern: string }
  | { present: true }
  | { absent: true }
  | { oneOf: unknown[] }
  | { type: string };

export interface ExpectedToolCall {
  toolName: string;
  arguments: Record<string, ArgumentMatcher | unknown>;
  weight?: number;
}

export interface EvalStep {
  userPrompt: string;
  systemPromptOverride?: string;
  expected: ExpectedToolCall[];
  /** Synthetic tool result to inject for multi-step context */
  syntheticResult?: string;
}

export interface EvalScenario {
  id: string;
  description: string;
  category: string;
  tags: string[];
  steps: EvalStep[];
}

// --- Scoring types ---

export interface ParameterResult {
  name: string;
  expected: unknown;
  actual: unknown;
  matched: boolean;
  reason?: string;
}

export interface ScoreBreakdown {
  toolSelection: number;
  operationSelection: number;
  parameterNames: number;
  parameterValues: number;
  overall: number;
  details: {
    expectedTool: string;
    actualTool: string | null;
    expectedOperation: string | unknown;
    actualOperation: string | null;
    parameterResults: ParameterResult[];
  };
}

export interface StepResult {
  stepIndex: number;
  score: ScoreBreakdown;
  llmResponse: LLMProviderResponse;
  durationMs: number;
}

export interface ScenarioResult {
  scenarioId: string;
  description: string;
  category: string;
  tags: string[];
  steps: StepResult[];
  overallScore: number;
  passed: boolean;
}

// --- Report types ---

export interface CategorySummary {
  count: number;
  avgScore: number;
  passRate: number;
}

export interface EvalReport {
  timestamp: string;
  provider: string;
  model: string;
  mode: 'schema-only' | 'end-to-end';
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  passRate: number;
  averageScore: number;
  byCategory: Record<string, CategorySummary>;
  byTool: Record<string, CategorySummary>;
  scenarios: ScenarioResult[];
  totalTokens: { prompt: number; completion: number };
  totalDurationMs: number;
}
