/**
 * Loads and validates eval scenario JSON files.
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { EvalScenario } from './scoring/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCENARIOS_DIR = join(__dirname, 'scenarios');

/**
 * Load all scenario files from the scenarios/ directory.
 * Optionally filter by file name pattern (e.g., "device" loads device.scenarios.json).
 */
export function loadScenarios(filter?: string): EvalScenario[] {
  const files = readdirSync(SCENARIOS_DIR)
    .filter(f => f.endsWith('.scenarios.json'))
    .filter(f => !filter || f.includes(filter));

  const scenarios: EvalScenario[] = [];

  for (const file of files) {
    const filePath = join(SCENARIOS_DIR, file);
    const content = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content) as EvalScenario[];

    for (const scenario of parsed) {
      validateScenario(scenario, file);
      scenarios.push(scenario);
    }
  }

  return scenarios;
}

/**
 * Validate a scenario has required fields.
 */
function validateScenario(scenario: EvalScenario, sourceFile: string): void {
  if (!scenario.id) {
    throw new Error(`Scenario missing 'id' in ${sourceFile}`);
  }
  if (!scenario.steps || scenario.steps.length === 0) {
    throw new Error(`Scenario '${scenario.id}' has no steps in ${sourceFile}`);
  }
  for (let i = 0; i < scenario.steps.length; i++) {
    const step = scenario.steps[i];
    if (!step.userPrompt) {
      throw new Error(`Scenario '${scenario.id}' step ${i} missing 'userPrompt' in ${sourceFile}`);
    }
    if (!step.expected || step.expected.length === 0) {
      throw new Error(`Scenario '${scenario.id}' step ${i} missing 'expected' in ${sourceFile}`);
    }
    for (const exp of step.expected) {
      if (!exp.toolName) {
        throw new Error(`Scenario '${scenario.id}' step ${i} expected missing 'toolName' in ${sourceFile}`);
      }
    }
  }
}

/**
 * List available scenario files.
 */
export function listScenarioFiles(): string[] {
  return readdirSync(SCENARIOS_DIR).filter(f => f.endsWith('.scenarios.json'));
}
