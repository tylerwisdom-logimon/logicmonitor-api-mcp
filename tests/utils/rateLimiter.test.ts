/**
 * Unit tests for RateLimiter utility
 */

import { RateLimiter } from '../../src/utils/rateLimiter.js';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
  });

  describe('extractRateLimitInfo', () => {
    it('should extract all three headers correctly', () => {
      const info = limiter.extractRateLimitInfo({
        'x-rate-limit-limit': '100',
        'x-rate-limit-remaining': '42',
        'x-rate-limit-window': '60'
      });

      expect(info).not.toBeNull();
      expect(info!.limit).toBe(100);
      expect(info!.remaining).toBe(42);
      expect(info!.window).toBe(60);
    });

    it('should return null when both limit and remaining are missing', () => {
      const info = limiter.extractRateLimitInfo({
        'x-rate-limit-window': '60'
      });

      expect(info).toBeNull();
    });

    it('should return partial info when only remaining is missing', () => {
      const info = limiter.extractRateLimitInfo({
        'x-rate-limit-limit': '100',
        'x-rate-limit-window': '60'
      });

      expect(info).not.toBeNull();
      expect(info!.limit).toBe(100);
      expect(info!.remaining).toBe(-1);
      expect(info!.window).toBe(60);
    });

    it('should return partial info when only limit is missing', () => {
      const info = limiter.extractRateLimitInfo({
        'x-rate-limit-remaining': '5',
        'x-rate-limit-window': '60'
      });

      expect(info).not.toBeNull();
      expect(info!.limit).toBe(-1);
      expect(info!.remaining).toBe(5);
    });

    it('should default window to 60 when missing', () => {
      const info = limiter.extractRateLimitInfo({
        'x-rate-limit-limit': '100',
        'x-rate-limit-remaining': '50'
      });

      expect(info).not.toBeNull();
      expect(info!.window).toBe(60);
    });

    it('should return null for completely empty headers', () => {
      expect(limiter.extractRateLimitInfo({})).toBeNull();
    });

    it('should return null for malformed header values', () => {
      const info = limiter.extractRateLimitInfo({
        'x-rate-limit-limit': 'abc',
        'x-rate-limit-remaining': 'xyz',
        'x-rate-limit-window': '60'
      });

      expect(info).toBeNull();
    });
  });

  describe('shouldBackoff', () => {
    it('should return false when no rate limit info is stored', () => {
      expect(limiter.shouldBackoff('api-request')).toBe(false);
    });

    it('should return true when remaining is at or below threshold', () => {
      const info = limiter.extractRateLimitInfo({
        'x-rate-limit-limit': '100',
        'x-rate-limit-remaining': '5',
        'x-rate-limit-window': '60'
      });
      limiter.updateRateLimitInfo('api-request', info);

      expect(limiter.shouldBackoff('api-request', 10)).toBe(true);
    });

    it('should return false when remaining is above threshold', () => {
      const info = limiter.extractRateLimitInfo({
        'x-rate-limit-limit': '100',
        'x-rate-limit-remaining': '50',
        'x-rate-limit-window': '60'
      });
      limiter.updateRateLimitInfo('api-request', info);

      expect(limiter.shouldBackoff('api-request', 10)).toBe(false);
    });

    it('should return false when remaining is unknown (-1)', () => {
      const info = limiter.extractRateLimitInfo({
        'x-rate-limit-limit': '100',
        'x-rate-limit-window': '60'
      });
      limiter.updateRateLimitInfo('api-request', info);

      expect(limiter.shouldBackoff('api-request')).toBe(false);
    });
  });

  describe('updateRateLimitInfo - window tracking', () => {
    it('should calculate resetTime from window start', () => {
      const info = limiter.extractRateLimitInfo({
        'x-rate-limit-limit': '100',
        'x-rate-limit-remaining': '99',
        'x-rate-limit-window': '60'
      });

      const before = Date.now();
      limiter.updateRateLimitInfo('api-request', info);
      const after = Date.now();

      const stored = limiter.getRateLimitInfo('api-request');
      expect(stored).toBeDefined();
      // resetTime should be approximately now + 60s
      expect(stored!.resetTime).toBeGreaterThanOrEqual(before + 60000);
      expect(stored!.resetTime).toBeLessThanOrEqual(after + 60000);
    });

    it('should detect new window when remaining increases', () => {
      // First update: remaining = 50
      const info1 = limiter.extractRateLimitInfo({
        'x-rate-limit-limit': '100',
        'x-rate-limit-remaining': '50',
        'x-rate-limit-window': '60'
      });
      limiter.updateRateLimitInfo('api-request', info1);

      // Second update: remaining = 100 (new window)
      const info2 = limiter.extractRateLimitInfo({
        'x-rate-limit-limit': '100',
        'x-rate-limit-remaining': '100',
        'x-rate-limit-window': '60'
      });
      const before = Date.now();
      limiter.updateRateLimitInfo('api-request', info2);

      const stored = limiter.getRateLimitInfo('api-request');
      // After a new window, resetTime should be recalculated from now
      expect(stored!.resetTime).toBeGreaterThanOrEqual(before + 60000);
    });
  });

  describe('calculateBackoff', () => {
    it('should calculate exponential backoff', () => {
      // First attempt: ~1000ms (plus jitter)
      const delay1 = limiter.calculateBackoff(1);
      expect(delay1).toBeGreaterThanOrEqual(1000);
      expect(delay1).toBeLessThanOrEqual(1200);

      // Second attempt: ~2000ms (plus jitter)
      const delay2 = limiter.calculateBackoff(2);
      expect(delay2).toBeGreaterThanOrEqual(2000);
      expect(delay2).toBeLessThanOrEqual(2400);
    });

    it('should respect maxDelay', () => {
      const delay = limiter.calculateBackoff(20); // Very high attempt
      expect(delay).toBeLessThanOrEqual(66000); // maxDelay (60000) + 10% jitter
    });
  });

  describe('clear', () => {
    it('should clear all stored rate limit info', () => {
      const info = limiter.extractRateLimitInfo({
        'x-rate-limit-limit': '100',
        'x-rate-limit-remaining': '5',
        'x-rate-limit-window': '60'
      });
      limiter.updateRateLimitInfo('api-request', info);
      expect(limiter.shouldBackoff('api-request')).toBe(true);

      limiter.clear();

      expect(limiter.shouldBackoff('api-request')).toBe(false);
      expect(limiter.getRateLimitInfo('api-request')).toBeUndefined();
    });
  });
});
