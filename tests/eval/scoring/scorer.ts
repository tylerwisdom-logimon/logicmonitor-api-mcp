/**
 * Scoring engine for LLM eval harness.
 * Compares actual LLM tool calls against expected tool calls.
 */

import type { LLMToolCall } from '../providers/types.js';
import type {
  ArgumentMatcher,
  ExpectedToolCall,
  ScoreBreakdown,
  ParameterResult
} from './types.js';

const WEIGHTS = {
  toolSelection: 0.30,
  operationSelection: 0.25,
  parameterNames: 0.20,
  parameterValues: 0.25,
};

/**
 * Score a single LLM tool call against the expected tool call.
 */
export function scoreToolCall(
  actual: LLMToolCall | null,
  expected: ExpectedToolCall
): ScoreBreakdown {
  const details: ScoreBreakdown['details'] = {
    expectedTool: expected.toolName,
    actualTool: actual?.toolName ?? null,
    expectedOperation: getExpectedOperationValue(expected),
    actualOperation: actual ? (actual.arguments.operation as string ?? null) : null,
    parameterResults: [],
  };

  // No tool call at all
  if (!actual) {
    return {
      toolSelection: 0,
      operationSelection: 0,
      parameterNames: 0,
      parameterValues: 0,
      overall: 0,
      details,
    };
  }

  // Tool selection: binary
  const toolSelection = actual.toolName === expected.toolName ? 1 : 0;

  // Operation selection: binary
  const expectedOpMatcher = normalizeMatcher(expected.arguments.operation);
  const actualOp = actual.arguments.operation as string | undefined;
  const operationSelection = matchArgumentValue(actualOp, expectedOpMatcher).matched ? 1 : 0;

  // Parameter names and values (exclude 'operation' — scored separately)
  const expectedParams = Object.entries(expected.arguments).filter(([k]) => k !== 'operation');
  let namesCorrect = 0;
  let valuesCorrect = 0;
  let valuesChecked = 0;

  for (const [paramName, matcher] of expectedParams) {
    const actualValue = actual.arguments[paramName];
    const normalizedMatcher = normalizeMatcher(matcher);

    // Check for 'absent' matcher
    if (isAbsentMatcher(normalizedMatcher)) {
      const isAbsent = actualValue === undefined;
      details.parameterResults.push({
        name: paramName,
        expected: { absent: true },
        actual: actualValue,
        matched: isAbsent,
        reason: isAbsent ? undefined : 'Parameter should not be present',
      });
      if (isAbsent) {
        namesCorrect++;
        valuesCorrect++;
      }
      valuesChecked++;
      continue;
    }

    // Parameter presence check
    const isPresent = actualValue !== undefined;
    if (isPresent) namesCorrect++;

    // Value check
    const result = matchArgumentValue(actualValue, normalizedMatcher);
    details.parameterResults.push({
      name: paramName,
      expected: normalizedMatcher,
      actual: actualValue,
      matched: result.matched,
      reason: result.reason,
    });
    if (result.matched) valuesCorrect++;
    valuesChecked++;
  }

  const totalExpected = expectedParams.length || 1;
  const parameterNames = namesCorrect / totalExpected;
  const parameterValues = valuesChecked > 0 ? valuesCorrect / valuesChecked : 1;

  const overall =
    WEIGHTS.toolSelection * toolSelection +
    WEIGHTS.operationSelection * operationSelection +
    WEIGHTS.parameterNames * parameterNames +
    WEIGHTS.parameterValues * parameterValues;

  return {
    toolSelection,
    operationSelection,
    parameterNames,
    parameterValues,
    overall,
    details,
  };
}

/**
 * Score multiple actual tool calls against multiple expected calls.
 * Returns the best matching score (greedy assignment).
 */
export function scoreStep(
  actualCalls: LLMToolCall[],
  expectedCalls: ExpectedToolCall[]
): ScoreBreakdown {
  if (expectedCalls.length === 0) {
    return {
      toolSelection: 1,
      operationSelection: 1,
      parameterNames: 1,
      parameterValues: 1,
      overall: 1,
      details: {
        expectedTool: '',
        actualTool: null,
        expectedOperation: '',
        actualOperation: null,
        parameterResults: [],
      },
    };
  }

  // For single expected call (most common), match against best actual call
  if (expectedCalls.length === 1) {
    const expected = expectedCalls[0];
    if (actualCalls.length === 0) {
      return scoreToolCall(null, expected);
    }
    // Find the best match among actual calls
    let best: ScoreBreakdown | null = null;
    for (const actual of actualCalls) {
      const score = scoreToolCall(actual, expected);
      if (!best || score.overall > best.overall) {
        best = score;
      }
    }
    return best!;
  }

  // Multiple expected calls: score each expected against best matching actual
  const scores = expectedCalls.map(expected => {
    if (actualCalls.length === 0) return scoreToolCall(null, expected);
    let best: ScoreBreakdown | null = null;
    for (const actual of actualCalls) {
      const score = scoreToolCall(actual, expected);
      if (!best || score.overall > best.overall) best = score;
    }
    return best!;
  });

  // Average across expected calls
  const avg = (field: keyof Omit<ScoreBreakdown, 'details' | 'overall'>) =>
    scores.reduce((sum, s) => sum + s[field], 0) / scores.length;

  return {
    toolSelection: avg('toolSelection'),
    operationSelection: avg('operationSelection'),
    parameterNames: avg('parameterNames'),
    parameterValues: avg('parameterValues'),
    overall: scores.reduce((sum, s) => sum + s.overall, 0) / scores.length,
    details: scores[0].details, // Use first expected for details
  };
}

// --- Matcher helpers ---

function normalizeMatcher(value: unknown): ArgumentMatcher {
  if (value === null || value === undefined) {
    return { exact: value };
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if ('exact' in obj || 'contains' in obj || 'pattern' in obj ||
        'present' in obj || 'absent' in obj || 'oneOf' in obj || 'type' in obj) {
      return value as ArgumentMatcher;
    }
  }
  // Shorthand: raw value treated as exact match
  return { exact: value };
}

function isAbsentMatcher(matcher: ArgumentMatcher): boolean {
  return typeof matcher === 'object' && matcher !== null && 'absent' in matcher;
}

/** Extract the expected operation value for display in details */
function getExpectedOperationValue(expected: ExpectedToolCall): unknown {
  const opMatcher = expected.arguments.operation;
  if (!opMatcher) return undefined;
  const normalized = normalizeMatcher(opMatcher);
  if ('exact' in normalized) return normalized.exact;
  if ('oneOf' in normalized) return normalized.oneOf;
  return opMatcher;
}

function matchArgumentValue(
  actual: unknown,
  matcher: ArgumentMatcher
): { matched: boolean; reason?: string } {
  if ('exact' in matcher) {
    const matched = deepEqual(actual, matcher.exact);
    return {
      matched,
      reason: matched ? undefined : `Expected ${JSON.stringify(matcher.exact)}, got ${JSON.stringify(actual)}`,
    };
  }

  if ('contains' in matcher) {
    if (typeof actual !== 'string') {
      return { matched: false, reason: `Expected string containing "${matcher.contains}", got ${typeof actual}` };
    }
    const matched = actual.includes(matcher.contains);
    return {
      matched,
      reason: matched ? undefined : `String "${actual}" does not contain "${matcher.contains}"`,
    };
  }

  if ('pattern' in matcher) {
    if (typeof actual !== 'string') {
      return { matched: false, reason: `Expected string matching /${matcher.pattern}/, got ${typeof actual}` };
    }
    const matched = new RegExp(matcher.pattern).test(actual);
    return {
      matched,
      reason: matched ? undefined : `String "${actual}" does not match /${matcher.pattern}/`,
    };
  }

  if ('present' in matcher) {
    const matched = actual !== undefined;
    return {
      matched,
      reason: matched ? undefined : 'Parameter is missing',
    };
  }

  if ('absent' in matcher) {
    const matched = actual === undefined;
    return {
      matched,
      reason: matched ? undefined : `Parameter should not be present, got ${JSON.stringify(actual)}`,
    };
  }

  if ('oneOf' in matcher) {
    const matched = matcher.oneOf.some(v => deepEqual(actual, v));
    return {
      matched,
      reason: matched ? undefined : `Value ${JSON.stringify(actual)} not in [${matcher.oneOf.map(v => JSON.stringify(v)).join(', ')}]`,
    };
  }

  if ('type' in matcher) {
    const matched = typeof actual === matcher.type;
    return {
      matched,
      reason: matched ? undefined : `Expected type "${matcher.type}", got "${typeof actual}"`,
    };
  }

  return { matched: false, reason: 'Unknown matcher type' };
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => deepEqual(val, b[i]));
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a as Record<string, unknown>);
    const keysB = Object.keys(b as Record<string, unknown>);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(key =>
      deepEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key]
      )
    );
  }

  return false;
}
