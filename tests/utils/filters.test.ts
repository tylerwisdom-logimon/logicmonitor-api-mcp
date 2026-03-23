/**
 * Unit tests for LogicMonitor filter utilities
 */

import { formatLogicMonitorFilter } from '../../src/utils/filters.js';

describe('formatLogicMonitorFilter', () => {
  describe('basic filter formatting', () => {
    it('should pass through already-quoted filters', () => {
      expect(formatLogicMonitorFilter('displayName:"prod*"')).toBe('displayName:"prod*"');
    });

    it('should auto-quote string values', () => {
      expect(formatLogicMonitorFilter('displayName:prod*')).toBe('displayName:"prod*"');
    });

    it('should not quote numeric values', () => {
      expect(formatLogicMonitorFilter('id:123')).toBe('id:123');
    });

    it('should not quote boolean values', () => {
      expect(formatLogicMonitorFilter('disableAlerting:false')).toBe('disableAlerting:false');
    });

    it('should not quote decimal values', () => {
      expect(formatLogicMonitorFilter('threshold:3.14')).toBe('threshold:3.14');
    });

    it('should return empty string as-is', () => {
      expect(formatLogicMonitorFilter('')).toBe('');
    });
  });

  describe('operators', () => {
    it('should handle equality operator (:)', () => {
      expect(formatLogicMonitorFilter('name:"test"')).toBe('name:"test"');
    });

    it('should handle not-equal operator (!:)', () => {
      expect(formatLogicMonitorFilter('status!:active')).toBe('status!:"active"');
    });

    it('should handle greater-than operator (>)', () => {
      expect(formatLogicMonitorFilter('id>100')).toBe('id>100');
    });

    it('should handle greater-than-or-equal operator (>:)', () => {
      expect(formatLogicMonitorFilter('id>:100')).toBe('id>:100');
    });

    it('should handle less-than operator (<)', () => {
      expect(formatLogicMonitorFilter('id<500')).toBe('id<500');
    });

    it('should handle contains operator (~)', () => {
      expect(formatLogicMonitorFilter('name~test')).toBe('name~"test"');
    });

    it('should handle not-contains operator (!~)', () => {
      expect(formatLogicMonitorFilter('name!~deprecated')).toBe('name!~"deprecated"');
    });
  });

  describe('compound filters', () => {
    it('should handle AND conditions (comma-separated)', () => {
      const result = formatLogicMonitorFilter('name:web*,status:active');
      expect(result).toBe('name:"web*",status:"active"');
    });

    it('should handle OR conditions (|| separated)', () => {
      const result = formatLogicMonitorFilter('name:"web*"||name:"app*"');
      expect(result).toBe('name:"web*"||name:"app*"');
    });

    it('should handle multiple values with pipe (|)', () => {
      const result = formatLogicMonitorFilter('status:active|pending');
      expect(result).toBe('status:"active"|"pending"');
    });
  });

  describe('field validation', () => {
    it('should throw for unknown fields when allowedFields is set', () => {
      const allowedFields = new Set(['name', 'id', 'status']);
      expect(() =>
        formatLogicMonitorFilter('bogusField:value', { allowedFields })
      ).toThrow('Unknown filter field: bogusField');
    });

    it('should include resource name in error message', () => {
      const allowedFields = new Set(['name']);
      expect(() =>
        formatLogicMonitorFilter('bogus:value', { allowedFields, resourceName: 'device' })
      ).toThrow('Unknown device filter field: bogus');
    });

    it('should not throw for known fields', () => {
      const allowedFields = new Set(['name', 'id']);
      expect(() =>
        formatLogicMonitorFilter('name:test', { allowedFields })
      ).not.toThrow();
    });
  });
});
