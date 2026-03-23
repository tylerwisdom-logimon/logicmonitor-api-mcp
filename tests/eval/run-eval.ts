#!/usr/bin/env node
/**
 * Standalone CLI for running LLM eval.
 * Usage:
 *   npx tsx tests/eval/run-eval.ts
 *   npx tsx tests/eval/run-eval.ts --model gpt-4o-mini
 *   npx tsx tests/eval/run-eval.ts --scenarios device
 *   npx tsx tests/eval/run-eval.ts --threshold 0.7
 */

import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import { runEval } from './eval-runner.js';
import { createProvider, type ProviderName } from './providers/index.js';
import { loadScenarios, listScenarioFiles } from './scenario-loader.js';
import { convertMCPToolsToOpenAI } from './schema-converter.js';
import { formatReport, saveReport } from './report.js';

function parseArgs(): {
  provider: ProviderName;
  model: string;
  scenarioFilter?: string;
  threshold: number;
  listOnly: boolean;
} {
  const args = process.argv.slice(2);
  let provider: ProviderName = (process.env.EVAL_PROVIDER as ProviderName) || 'openai';
  let model = process.env.EVAL_MODEL || 'gpt-4o';
  let scenarioFilter: string | undefined;
  let threshold = 0.8;
  let listOnly = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--provider':
        provider = args[++i] as ProviderName;
        break;
      case '--model':
        model = args[++i];
        break;
      case '--scenarios':
        scenarioFilter = args[++i];
        break;
      case '--threshold':
        threshold = parseFloat(args[++i]);
        break;
      case '--list':
        listOnly = true;
        break;
      case '--help':
        console.log(`
LLM Eval Harness for LogicMonitor MCP Server

Usage: npx tsx tests/eval/run-eval.ts [options]

Options:
  --provider <name>     LLM provider (default: openai)
  --model <name>        Model name (default: gpt-4o, or EVAL_MODEL env var)
  --scenarios <filter>  Filter scenario files by name (e.g., "device")
  --threshold <n>       Pass threshold 0-1 (default: 0.8)
  --list                List available scenario files and exit
  --help                Show this help

Environment:
  OPENAI_API_KEY        Required for OpenAI provider
  EVAL_MODEL            Default model (overridden by --model)
  EVAL_PROVIDER         Default provider (overridden by --provider)
`);
        process.exit(0);
    }
  }

  return { provider, model, scenarioFilter, threshold, listOnly };
}

async function main() {
  const opts = parseArgs();

  if (opts.listOnly) {
    console.log('Available scenario files:');
    for (const f of listScenarioFiles()) {
      console.log(`  ${f}`);
    }
    process.exit(0);
  }

  // Validate API key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Error: OPENAI_API_KEY environment variable is required.');
    console.error('Set it in your .env file or export it in your shell.');
    process.exit(1);
  }

  console.log(`Loading scenarios${opts.scenarioFilter ? ` (filter: ${opts.scenarioFilter})` : ''}...`);
  const scenarios = loadScenarios(opts.scenarioFilter);
  console.log(`Loaded ${scenarios.length} scenarios`);

  console.log('Converting MCP tool schemas to OpenAI format...');
  const tools = await convertMCPToolsToOpenAI();
  console.log(`Converted ${tools.length} tools`);

  console.log(`\nRunning eval: provider=${opts.provider}, model=${opts.model}, threshold=${opts.threshold}\n`);

  const provider = createProvider(opts.provider, {
    apiKey,
    model: opts.model,
    temperature: 0,
  });

  const report = await runEval({
    provider,
    mode: 'schema-only',
    scenarios,
    tools,
    passThreshold: opts.threshold,
    delayBetweenCallsMs: 300,
    onScenarioComplete: (result) => {
      const status = result.passed ? '✓' : '✗';
      console.log(`  ${status} ${result.scenarioId}: ${result.overallScore.toFixed(3)}`);
    },
  });

  console.log(formatReport(report));

  const filePath = saveReport(report);
  console.log(`Full report saved to: ${filePath}`);

  // Exit with non-zero if pass rate is below threshold
  process.exit(report.passRate >= opts.threshold ? 0 : 1);
}

main().catch((err) => {
  console.error('Eval failed:', err);
  process.exit(1);
});
