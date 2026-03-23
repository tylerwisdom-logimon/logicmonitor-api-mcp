/**
 * Rate Limiting Utility for LogicMonitor API
 * 
 * Handles rate limit detection, backoff, and retry logic based on:
 * - X-Rate-Limit-Limit: Request limit per window
 * - X-Rate-Limit-Remaining: Requests left for the time window
 * - X-Rate-Limit-Window: Rolling time window in seconds
 */

import { AxiosHeaders, AxiosError } from 'axios';

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  window: number; // in seconds
  resetTime?: number; // timestamp when limit resets
}

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
}

export class RateLimiter {
  private currentLimits: Map<string, RateLimitInfo> = new Map();
  private windowStartTimes: Map<string, number> = new Map();
  private defaultOptions: Required<RetryOptions> = {
    maxRetries: 3,
    initialDelay: 1000, // 1 second
    maxDelay: 60000, // 60 seconds
    backoffMultiplier: 2
  };

  /**
   * Parse a single rate limit header value, returning null if missing or invalid
   */
  private parseHeader(value: unknown): number | null {
    if (value === undefined || value === null) return null;
    const parsed = parseInt(String(value));
    return isNaN(parsed) ? null : parsed;
  }

  /**
   * Extract rate limit information from response headers.
   * Returns partial info when possible rather than discarding everything
   * if a single header is missing.
   */
  extractRateLimitInfo(headers: AxiosHeaders | Record<string, string>): RateLimitInfo | null {
    const limit = this.parseHeader(headers['x-rate-limit-limit']);
    const remaining = this.parseHeader(headers['x-rate-limit-remaining']);
    const window = this.parseHeader(headers['x-rate-limit-window']);

    // Need at least limit or remaining to be useful
    if (limit === null && remaining === null) {
      return null;
    }

    const windowSeconds = window ?? 60; // Default to 60s if window header missing

    return {
      limit: limit ?? -1,
      remaining: remaining ?? -1,
      window: windowSeconds
    };
  }

  /**
   * Update stored rate limit info for a given key (e.g., API endpoint).
   * Tracks window start time to calculate accurate reset times.
   */
  updateRateLimitInfo(key: string, info: RateLimitInfo | null): void {
    if (!info) return;

    const previous = this.currentLimits.get(key);
    const now = Date.now();

    // Detect new window: remaining went up (reset) or no previous data
    if (!previous || (previous.remaining >= 0 && info.remaining >= 0 && info.remaining > previous.remaining)) {
      this.windowStartTimes.set(key, now);
    }

    // If we haven't observed a window start yet, assume it started now
    if (!this.windowStartTimes.has(key)) {
      this.windowStartTimes.set(key, now);
    }

    const windowStart = this.windowStartTimes.get(key) ?? now;
    info.resetTime = windowStart + (info.window * 1000);

    this.currentLimits.set(key, info);
  }

  /**
   * Check if we should preemptively back off based on remaining requests.
   * Returns false if remaining is unknown (-1).
   */
  shouldBackoff(key: string, threshold: number = 10): boolean {
    const info = this.currentLimits.get(key);
    if (!info || info.remaining < 0) return false;

    // Back off if we're getting close to the limit
    return info.remaining <= threshold;
  }

  /**
   * Calculate backoff delay based on attempt number
   */
  calculateBackoff(attempt: number, options?: RetryOptions): number {
    const opts = { ...this.defaultOptions, ...options };
    const delay = Math.min(
      opts.initialDelay * Math.pow(opts.backoffMultiplier, attempt - 1),
      opts.maxDelay
    );
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay;
    return Math.floor(delay + jitter);
  }

  /**
   * Calculate delay based on rate limit reset time
   */
  calculateDelayUntilReset(key: string): number {
    const info = this.currentLimits.get(key);
    if (!info || !info.resetTime) return 0;
    
    const now = Date.now();
    const delay = Math.max(0, info.resetTime - now);
    
    // Add small buffer to ensure we're past the reset
    return delay + 1000;
  }

  /**
   * Check if error is a rate limit error
   */
  isRateLimitError(error: unknown): boolean {
    if (error instanceof AxiosError) {
      return error.response?.status === 429;
    }
    return false;
  }

  /**
   * Execute a function with retry logic for rate limits
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    key: string,
    options?: RetryOptions
  ): Promise<T> {
    const opts = { ...this.defaultOptions, ...options };
    let lastError: unknown;

    for (let attempt = 1; attempt <= opts.maxRetries; attempt++) {
      try {
        // Check if we should preemptively back off
        if (this.shouldBackoff(key)) {
          const delay = this.calculateDelayUntilReset(key);
          if (delay > 0) {
            await this.sleep(delay);
          }
        }

        return await fn();
      } catch (error) {
        lastError = error;

        if (!this.isRateLimitError(error)) {
          throw error; // Not a rate limit error, don't retry
        }

        if (attempt === opts.maxRetries) {
          break; // No more retries
        }

        // Extract rate limit info from error response if available
        if (error instanceof AxiosError && error.response) {
          const info = this.extractRateLimitInfo(error.response.headers as AxiosHeaders);
          if (info) {
            this.updateRateLimitInfo(key, info);
          }
        }

        // Calculate delay
        const delay = this.calculateBackoff(attempt, options);
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Get current rate limit info for a key
   */
  getRateLimitInfo(key: string): RateLimitInfo | undefined {
    return this.currentLimits.get(key);
  }

  /**
   * Clear stored rate limit info
   */
  clear(): void {
    this.currentLimits.clear();
    this.windowStartTimes.clear();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();