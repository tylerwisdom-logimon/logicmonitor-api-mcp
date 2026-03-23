/**
 * Jest wrapper for LLM eval harness.
 * Skips gracefully if OPENAI_API_KEY is not set.
 */

import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import { runEval } from './eval-runner.js';
import { createProvider } from './providers/index.js';
import { loadScenarios } from './scenario-loader.js';
import { convertMCPToolsToOpenAI } from './schema-converter.js';
import { formatReport, saveReport } from './report.js';
import type { EvalReport } from './scoring/types.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EVAL_MODEL = process.env.EVAL_MODEL || 'gpt-4o';

const describeIfKey = OPENAI_API_KEY ? describe : describe.skip;

describeIfKey('LLM Eval - Schema Only', () => {
  let report: EvalReport;

  beforeAll(async () => {
    const provider = createProvider('openai', {
      apiKey: OPENAI_API_KEY!,
      model: EVAL_MODEL,
      temperature: 0,
    });

    const scenarios = loadScenarios();
    const tools = await convertMCPToolsToOpenAI();

    report = await runEval({
      provider,
      mode: 'schema-only',
      scenarios,
      tools,
      delayBetweenCallsMs: 300,
      onScenarioComplete: (result) => {
        const status = result.passed ? '✓' : '✗';
        console.log(`  ${status} ${result.scenarioId}: ${result.overallScore.toFixed(3)}`);
      },
    });

    // Print report and save to file
    console.log(formatReport(report));
    const filePath = saveReport(report);
    console.log(`Report saved to: ${filePath}`);
  }, 300_000); // 5 minute timeout for all API calls

  test('pass rate should meet minimum threshold', () => {
    expect(report.passRate).toBeGreaterThanOrEqual(0.7);
  });

  test('tool selection accuracy should be high', () => {
    const toolSelectionAvg = report.scenarios.reduce(
      (sum, s) => sum + s.steps.reduce(
        (ss, step) => ss + step.score.toolSelection, 0
      ) / s.steps.length,
      0
    ) / report.scenarios.length;
    expect(toolSelectionAvg).toBeGreaterThanOrEqual(0.85);
  });

  test('operation selection accuracy should be high', () => {
    const opSelectionAvg = report.scenarios.reduce(
      (sum, s) => sum + s.steps.reduce(
        (ss, step) => ss + step.score.operationSelection, 0
      ) / s.steps.length,
      0
    ) / report.scenarios.length;
    expect(opSelectionAvg).toBeGreaterThanOrEqual(0.8);
  });

  test('no tool should have 0% pass rate', () => {
    for (const [tool, summary] of Object.entries(report.byTool)) {
      expect(summary.passRate).toBeGreaterThan(0);
    }
  });
});
