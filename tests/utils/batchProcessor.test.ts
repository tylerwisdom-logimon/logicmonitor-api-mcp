/**
 * Unit tests for BatchProcessor utility
 */

import { BatchProcessor } from '../../src/utils/batchProcessor.js';
import { RateLimiter } from '../../src/utils/rateLimiter.js';

describe('BatchProcessor', () => {
  let processor: BatchProcessor;

  beforeEach(() => {
    // Use a fresh rate limiter instance (no shared state)
    processor = new BatchProcessor(new RateLimiter());
  });

  describe('processBatch', () => {
    it('should process all items successfully', async () => {
      const items = [1, 2, 3, 4, 5];
      const result = await processor.processBatch(
        items,
        async (item) => item * 2,
        { retryOnRateLimit: false }
      );

      expect(result.success).toBe(true);
      expect(result.summary.total).toBe(5);
      expect(result.summary.succeeded).toBe(5);
      expect(result.summary.failed).toBe(0);
      expect(result.results.map(r => r.data)).toEqual([2, 4, 6, 8, 10]);
    });

    it('should handle empty items array', async () => {
      const result = await processor.processBatch(
        [],
        async (item: number) => item * 2,
        { retryOnRateLimit: false }
      );

      expect(result.success).toBe(true);
      expect(result.summary.total).toBe(0);
      expect(result.summary.succeeded).toBe(0);
      expect(result.summary.failed).toBe(0);
      expect(result.results).toEqual([]);
    });

    it('should continue on error when continueOnError is true', async () => {
      const items = [1, 2, 3];
      const result = await processor.processBatch(
        items,
        async (item) => {
          if (item === 2) throw new Error('Item 2 failed');
          return item * 2;
        },
        { continueOnError: true, retryOnRateLimit: false }
      );

      expect(result.success).toBe(false);
      expect(result.summary.total).toBe(3);
      expect(result.summary.succeeded).toBe(2);
      expect(result.summary.failed).toBe(1);
      expect(result.results[0].success).toBe(true);
      expect(result.results[0].data).toBe(2);
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toBe('Item 2 failed');
      expect(result.results[2].success).toBe(true);
      expect(result.results[2].data).toBe(6);
    });

    it('should stop on error when continueOnError is false', async () => {
      const items = [1, 2, 3, 4, 5];
      const processed: number[] = [];

      await expect(processor.processBatch(
        items,
        async (item) => {
          processed.push(item);
          if (item === 2) throw new Error('Item 2 failed');
          return item * 2;
        },
        { continueOnError: false, maxConcurrent: 1, retryOnRateLimit: false }
      )).rejects.toThrow('Item 2 failed');
    });

    it('should respect maxConcurrent', async () => {
      let maxInFlight = 0;
      let currentInFlight = 0;
      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      await processor.processBatch(
        items,
        async (item) => {
          currentInFlight++;
          maxInFlight = Math.max(maxInFlight, currentInFlight);
          await new Promise(resolve => setTimeout(resolve, 10));
          currentInFlight--;
          return item;
        },
        { maxConcurrent: 3, retryOnRateLimit: false }
      );

      expect(maxInFlight).toBeLessThanOrEqual(3);
    });

    it('should invoke progress callback for every item including failures', async () => {
      const progressCalls: Array<[number, number]> = [];
      const items = [1, 2, 3];

      await processor.processBatch(
        items,
        async (item) => {
          if (item === 2) throw new Error('fail');
          return item;
        },
        {
          continueOnError: true,
          maxConcurrent: 1,
          retryOnRateLimit: false,
          onProgress: (completed, total) => {
            progressCalls.push([completed, total]);
          }
        }
      );

      // All 3 items should report progress (including the failed one)
      expect(progressCalls).toEqual([
        [1, 3],
        [2, 3],
        [3, 3]
      ]);
    });

    it('should handle structured processor results with diagnostics', async () => {
      const result = await processor.processBatch(
        [{ id: 1 }],
        async (item) => ({
          data: { id: item.id, name: 'test' },
          diagnostics: { status: 200, code: 'OK' },
          meta: { endpoint: '/test', method: 'get', params: {}, status: 200, durationMs: 100, timestamp: new Date().toISOString() }
        }),
        { retryOnRateLimit: false }
      );

      expect(result.results[0].success).toBe(true);
      expect(result.results[0].data).toEqual({ id: 1, name: 'test' });
      expect(result.results[0].diagnostics).toEqual({ status: 200, code: 'OK' });
    });
  });

  describe('unwrapSingleResult', () => {
    it('should unwrap a successful single-item batch', async () => {
      const batchResult = await processor.processBatch(
        [42],
        async (item) => item * 2,
        { retryOnRateLimit: false }
      );

      expect(BatchProcessor.unwrapSingleResult(batchResult)).toBe(84);
    });

    it('should throw for failed single-item batch', async () => {
      const batchResult = await processor.processBatch(
        [1],
        async () => { throw new Error('fail'); },
        { continueOnError: true, retryOnRateLimit: false }
      );

      expect(() => BatchProcessor.unwrapSingleResult(batchResult)).toThrow('fail');
    });

    it('should throw for multi-item batch', async () => {
      const batchResult = await processor.processBatch(
        [1, 2],
        async (item) => item,
        { retryOnRateLimit: false }
      );

      expect(() => BatchProcessor.unwrapSingleResult(batchResult)).toThrow('Expected single result but got multiple');
    });
  });
});
