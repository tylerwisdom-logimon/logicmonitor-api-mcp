/**
 * Common test utilities and helper functions
 */

/**
 * Wait for a specified duration
 */
export async function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delayMs?: number;
    backoffMultiplier?: number;
    onRetry?: (attempt: number, error: Error) => void;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delayMs = 1000,
    backoffMultiplier = 2,
    onRetry,
  } = options;

  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxAttempts) {
        if (onRetry) {
          onRetry(attempt, lastError);
        }
        
        const delay = delayMs * Math.pow(backoffMultiplier, attempt - 1);
        await wait(delay);
      }
    }
  }

  throw lastError!;
}

/**
 * Generate a unique test identifier
 */
export function generateTestId(prefix: string = 'test'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Generate a test resource name
 */
export function generateTestResourceName(resourceType: string): string {
  const timestamp = Date.now();
  return `${global.testConfig.testResourcePrefix}-${resourceType}-${timestamp}`;
}

/**
 * Check if a value is a valid LogicMonitor ID
 */
export function isValidLMId(value: unknown): value is number {
  return typeof value === 'number' && value > 0 && Number.isInteger(value);
}

/**
 * Assert that a tool call was successful
 */
export function assertToolSuccess(result: { success: boolean; error?: string; data?: unknown }): asserts result is { success: true; data: unknown } {
  if (!result.success) {
    throw new Error(`Tool call failed: ${result.error || 'Unknown error'}`);
  }
}

/**
 * Extract data from tool result
 */
export function extractToolData<T = unknown>(result: { data?: unknown }): T {
  if (!result.data) {
    throw new Error('Tool result has no data');
  }
  return result.data as T;
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: {
    timeoutMs?: number;
    intervalMs?: number;
    timeoutMessage?: string;
  } = {}
): Promise<void> {
  const {
    timeoutMs = 10000,
    intervalMs = 500,
    timeoutMessage = 'Condition not met within timeout',
  } = options;

  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return;
    }
    await wait(intervalMs);
  }

  throw new Error(timeoutMessage);
}

/**
 * Create a test description with timestamp
 */
export function testDescription(description: string): string {
  const timestamp = new Date().toISOString();
  return `${description} [${timestamp}]`;
}

/**
 * Safely parse JSON or return original value
 */
export function safeJsonParse<T = unknown>(value: string): T | string {
  try {
    return JSON.parse(value) as T;
  } catch {
    return value;
  }
}

/**
 * Check if an error is a rate limit error
 */
export function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('rate limit') || message.includes('429');
  }
  return false;
}

/**
 * Check if an error is a not found error
 */
export function isNotFoundError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('not found') || message.includes('404');
  }
  return false;
}

/**
 * Wait for newly created resources to be indexed and searchable
 * LogicMonitor has a slight delay between resource creation and search availability
 */
export async function waitForIndexing(delayMs: number = 10000): Promise<void> {
  await wait(delayMs);
}

