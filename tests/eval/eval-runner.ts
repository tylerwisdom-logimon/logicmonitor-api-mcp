/**
 * Eval runner — orchestrates scenario execution against an LLM provider.
 */

import type { LLMProvider, ChatMessage, OpenAIFunctionTool } from './providers/types.js';
import type {
  EvalScenario,
  EvalReport,
  ScenarioResult,
  StepResult,
  CategorySummary,
} from './scoring/types.js';
import { scoreStep } from './scoring/scorer.js';
import { convertMCPToolsToOpenAI, buildEvalSystemPrompt } from './schema-converter.js';

export interface EvalRunnerConfig {
  provider: LLMProvider;
  mode: 'schema-only' | 'end-to-end';
  scenarios: EvalScenario[];
  systemPrompt?: string;
  tools?: OpenAIFunctionTool[];
  passThreshold?: number;
  delayBetweenCallsMs?: number;
  onScenarioComplete?: (result: ScenarioResult) => void;
}

/**
 * Run all scenarios and produce an eval report.
 */
export async function runEval(config: EvalRunnerConfig): Promise<EvalReport> {
  const tools = config.tools ?? await convertMCPToolsToOpenAI();
  const systemPrompt = config.systemPrompt ?? buildEvalSystemPrompt();
  const passThreshold = config.passThreshold ?? 0.8;
  const delay = config.delayBetweenCallsMs ?? 500;

  const scenarioResults: ScenarioResult[] = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  const startMs = Date.now();

  for (const scenario of config.scenarios) {
    const result = await runScenario(scenario, config.provider, tools, systemPrompt, delay);
    result.passed = result.overallScore >= passThreshold;
    scenarioResults.push(result);

    // Accumulate tokens
    for (const step of result.steps) {
      totalPromptTokens += step.llmResponse.promptTokens ?? 0;
      totalCompletionTokens += step.llmResponse.completionTokens ?? 0;
    }

    config.onScenarioComplete?.(result);
  }

  const totalDurationMs = Date.now() - startMs;
  const passedScenarios = scenarioResults.filter(s => s.passed).length;
  const averageScore = scenarioResults.length > 0
    ? scenarioResults.reduce((sum, s) => sum + s.overallScore, 0) / scenarioResults.length
    : 0;

  return {
    timestamp: new Date().toISOString(),
    provider: config.provider.name,
    model: scenarioResults[0]?.steps[0]?.llmResponse.model ?? 'unknown',
    mode: config.mode,
    totalScenarios: scenarioResults.length,
    passedScenarios,
    failedScenarios: scenarioResults.length - passedScenarios,
    passRate: scenarioResults.length > 0 ? passedScenarios / scenarioResults.length : 0,
    averageScore,
    byCategory: buildCategorySummary(scenarioResults, 'category'),
    byTool: buildToolSummary(scenarioResults),
    scenarios: scenarioResults,
    totalTokens: { prompt: totalPromptTokens, completion: totalCompletionTokens },
    totalDurationMs,
  };
}

async function runScenario(
  scenario: EvalScenario,
  provider: LLMProvider,
  tools: OpenAIFunctionTool[],
  systemPrompt: string,
  delayMs: number
): Promise<ScenarioResult> {
  const stepResults: StepResult[] = [];
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
  ];

  for (let i = 0; i < scenario.steps.length; i++) {
    const step = scenario.steps[i];

    // Add user prompt
    messages.push({ role: 'user', content: step.userPrompt });

    const stepStart = Date.now();
    const llmResponse = await provider.chat({ messages, tools });
    const stepDuration = Date.now() - stepStart;

    // Score this step
    const score = scoreStep(llmResponse.toolCalls, step.expected);

    stepResults.push({
      stepIndex: i,
      score,
      llmResponse,
      durationMs: stepDuration,
    });

    // For multi-step: add assistant response and synthetic tool result to context
    if (scenario.steps.length > 1 && llmResponse.toolCalls.length > 0) {
      const toolCall = llmResponse.toolCalls[0];
      const toolCallId = `call_eval_${i}`;

      messages.push({
        role: 'assistant',
        tool_calls: [{
          id: toolCallId,
          type: 'function',
          function: {
            name: toolCall.toolName,
            arguments: JSON.stringify(toolCall.arguments),
          },
        }],
      });

      // Add synthetic or default tool result
      const syntheticResult = step.syntheticResult ??
        `Operation ${toolCall.arguments.operation ?? 'unknown'} completed successfully.`;

      messages.push({
        role: 'tool',
        tool_call_id: toolCallId,
        content: syntheticResult,
      });
    }

    // Rate limit protection
    if (i < scenario.steps.length - 1 && delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  const overallScore = stepResults.length > 0
    ? stepResults.reduce((sum, s) => sum + s.score.overall, 0) / stepResults.length
    : 0;

  return {
    scenarioId: scenario.id,
    description: scenario.description,
    category: scenario.category,
    tags: scenario.tags,
    steps: stepResults,
    overallScore,
    passed: false, // Set by caller after threshold check
  };
}

function buildCategorySummary(
  results: ScenarioResult[],
  field: 'category'
): Record<string, CategorySummary> {
  const groups = new Map<string, ScenarioResult[]>();
  for (const r of results) {
    const key = r[field];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const summary: Record<string, CategorySummary> = {};
  for (const [key, items] of groups) {
    const passed = items.filter(i => i.passed).length;
    summary[key] = {
      count: items.length,
      avgScore: items.reduce((s, i) => s + i.overallScore, 0) / items.length,
      passRate: passed / items.length,
    };
  }
  return summary;
}

function buildToolSummary(results: ScenarioResult[]): Record<string, CategorySummary> {
  const groups = new Map<string, ScenarioResult[]>();
  for (const r of results) {
    // Use the first expected tool name from the first step
    const tool = r.steps[0]?.score.details.expectedTool ?? 'unknown';
    if (!groups.has(tool)) groups.set(tool, []);
    groups.get(tool)!.push(r);
  }

  const summary: Record<string, CategorySummary> = {};
  for (const [key, items] of groups) {
    const passed = items.filter(i => i.passed).length;
    summary[key] = {
      count: items.length,
      avgScore: items.reduce((s, i) => s + i.overallScore, 0) / items.length,
      passRate: passed / items.length,
    };
  }
  return summary;
}
