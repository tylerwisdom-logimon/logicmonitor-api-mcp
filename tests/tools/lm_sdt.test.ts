/**
 * Test suite for lm_sdt tool
 * SDT (Scheduled Down Time) operations
 */

import { createTestClient, TestMCPClient } from '../utils/testClient.js';
import { assertToolSuccess, extractToolData } from '../utils/testHelpers.js';

describe('lm_sdt', () => {
  let client: TestMCPClient;

  beforeAll(async () => {
    client = await createTestClient('lm-sdt-test-session');
  });

  describe('List Operations', () => {
    test('should list SDTs with default parameters', async () => {
      const result = await client.callTool('lm_sdt', {
        operation: 'list',
      });

      assertToolSuccess(result);
      const data = extractToolData<{ success: boolean; items: unknown[]; total: number }>(result);

      expect(data.success).toBe(true);
      expect(Array.isArray(data.items)).toBe(true);
      expect(typeof data.total).toBe('number');
    });

    test('should list SDTs with size limit', async () => {
      const result = await client.callTool('lm_sdt', {
        operation: 'list',
        size: 5,
        autoPaginate: false,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ items: unknown[] }>(result);

      expect(Array.isArray(data.items)).toBe(true);
      expect(data.items.length).toBeLessThanOrEqual(5);
    });

    test('should list SDTs with filter', async () => {
      const result = await client.callTool('lm_sdt', {
        operation: 'list',
        filter: 'isEffective:true',
      });

      assertToolSuccess(result);
      const data = extractToolData<{ items: Array<{ isEffective?: boolean }> }>(result);

      expect(Array.isArray(data.items)).toBe(true);
    });

    test('should list SDTs with field selection', async () => {
      const result = await client.callTool('lm_sdt', {
        operation: 'list',
        size: 1,
        fields: 'id,type,sdtType,isEffective',
      });

      assertToolSuccess(result);
      const data = extractToolData<{ items: Array<{ id: string; type: string }> }>(result);

      if (data.items.length > 0) {
        const sdt = data.items[0];
        expect(sdt).toHaveProperty('id');
        expect(sdt).toHaveProperty('type');
      }
    });

    test('should handle pagination with offset', async () => {
      const firstPage = await client.callTool('lm_sdt', {
        operation: 'list',
        size: 2,
        offset: 0,
      });

      assertToolSuccess(firstPage);
      const firstData = extractToolData<{ items: Array<{ id: string }> }>(firstPage);

      if (firstData.items.length > 1) {
        const secondPage = await client.callTool('lm_sdt', {
          operation: 'list',
          size: 2,
          offset: 2,
        });

        assertToolSuccess(secondPage);
        const secondData = extractToolData<{ items: Array<{ id: string }> }>(secondPage);

        if (secondData.items.length > 0) {
          expect(firstData.items[0].id).not.toBe(secondData.items[0].id);
        }
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid field names', async () => {
      const result = await client.callTool('lm_sdt', {
        operation: 'list',
        fields: 'id,invalidFieldName',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown');
    });
  });
});
