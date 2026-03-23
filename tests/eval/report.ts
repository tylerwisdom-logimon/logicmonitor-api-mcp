/**
 * Report formatter for eval results.
 * Outputs console summary and JSON file.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { EvalReport, ScenarioResult } from './scoring/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = join(__dirname, 'reports');

/**
 * Format a console-friendly summary of the eval report.
 */
export function formatReport(report: EvalReport): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('═══════════════════════════════════════════════');
  lines.push('           LLM EVAL REPORT');
  lines.push('═══════════════════════════════════════════════');
  lines.push(`Provider: ${report.provider} | Model: ${report.model} | Mode: ${report.mode}`);
  lines.push(`Scenarios: ${report.passedScenarios}/${report.totalScenarios} passed (${(report.passRate * 100).toFixed(1)}%)`);
  lines.push(`Average Score: ${report.averageScore.toFixed(3)}`);
  lines.push(`Duration: ${(report.totalDurationMs / 1000).toFixed(1)}s | Tokens: ${report.totalTokens.prompt + report.totalTokens.completion} (${report.totalTokens.prompt} prompt + ${report.totalTokens.completion} completion)`);
  lines.push('');

  // By Category
  lines.push('── By Category ──');
  for (const [cat, summary] of Object.entries(report.byCategory)) {
    const passed = Math.round(summary.passRate * summary.count);
    lines.push(`  ${cat.padEnd(25)} ${passed}/${summary.count} passed  avg: ${summary.avgScore.toFixed(3)}  pass: ${(summary.passRate * 100).toFixed(0)}%`);
  }
  lines.push('');

  // By Tool
  lines.push('── By Tool ──');
  for (const [tool, summary] of Object.entries(report.byTool)) {
    const passed = Math.round(summary.passRate * summary.count);
    lines.push(`  ${tool.padEnd(25)} ${passed}/${summary.count} passed  avg: ${summary.avgScore.toFixed(3)}  pass: ${(summary.passRate * 100).toFixed(0)}%`);
  }
  lines.push('');

  // Failed scenarios
  const failed = report.scenarios.filter(s => !s.passed);
  if (failed.length > 0) {
    lines.push('── Failed Scenarios ──');
    for (const scenario of failed) {
      lines.push(`  ${scenario.scenarioId}: ${scenario.overallScore.toFixed(3)} — ${scenario.description}`);
      for (const step of scenario.steps) {
        const d = step.score.details;
        if (step.score.toolSelection === 0) {
          lines.push(`    Step ${step.stepIndex}: Wrong tool: expected ${d.expectedTool}, got ${d.actualTool}`);
        } else if (step.score.operationSelection === 0) {
          lines.push(`    Step ${step.stepIndex}: Wrong operation: expected ${JSON.stringify(d.expectedOperation)}, got ${d.actualOperation}`);
        }
        const failedParams = d.parameterResults.filter(p => !p.matched);
        for (const p of failedParams) {
          lines.push(`    Step ${step.stepIndex}: Param '${p.name}': ${p.reason}`);
        }
      }
    }
    lines.push('');
  }

  // Passed scenarios (brief)
  const passed = report.scenarios.filter(s => s.passed);
  if (passed.length > 0) {
    lines.push('── Passed Scenarios ──');
    for (const scenario of passed) {
      lines.push(`  ✓ ${scenario.scenarioId}: ${scenario.overallScore.toFixed(3)}`);
    }
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════════');
  return lines.join('\n');
}

/**
 * Save the full report as a JSON file.
 * Returns the file path.
 */
export function saveReport(report: EvalReport): string {
  mkdirSync(REPORTS_DIR, { recursive: true });

  const timestamp = report.timestamp.replace(/[:.]/g, '-');
  const filename = `eval-${report.provider}-${report.model.replace(/[/]/g, '-')}-${timestamp}.json`;
  const filePath = join(REPORTS_DIR, filename);

  // Strip rawResponse to keep file size manageable
  const stripped = {
    ...report,
    scenarios: report.scenarios.map(s => ({
      ...s,
      steps: s.steps.map(step => ({
        ...step,
        llmResponse: {
          ...step.llmResponse,
          rawResponse: undefined,
        },
      })),
    })),
  };

  writeFileSync(filePath, JSON.stringify(stripped, null, 2));
  return filePath;
}
