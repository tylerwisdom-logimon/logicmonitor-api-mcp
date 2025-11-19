/**
 * Test suite for lm_collector tool
 * Read-only operations
 */

import { createTestClient, TestMCPClient } from '../utils/testClient.js';
import { assertToolSuccess, extractToolData } from '../utils/testHelpers.js';

describe('lm_collector', () => {
  let client: TestMCPClient;

  beforeAll(async () => {
    client = await createTestClient('lm-collector-test-session');
  });

  describe('List Operations', () => {
    test('should list collectors with default parameters', async () => {
      const result = await client.callTool('lm_collector', {
        operation: 'list',
      });

      assertToolSuccess(result);
      const data = extractToolData<{ success: boolean; items: unknown[]; total: number }>(result);

      expect(data.success).toBe(true);
      expect(Array.isArray(data.items)).toBe(true);
      expect(typeof data.total).toBe('number');
    });

    test('should list collectors with size limit', async () => {
      const result = await client.callTool('lm_collector', {
        operation: 'list',
        size: 5,
        autoPaginate: false,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ items: unknown[] }>(result);

      expect(Array.isArray(data.items)).toBe(true);
      expect(data.items.length).toBeLessThanOrEqual(5);
    });

    test('should list collectors with filter', async () => {
      const result = await client.callTool('lm_collector', {
        operation: 'list',
        filter: 'status:1',
      });

      assertToolSuccess(result);
      const data = extractToolData<{ items: Array<{ status?: string }> }>(result);

      expect(Array.isArray(data.items)).toBe(true);
      // If there are items, they should be active
      if (data.items.length > 0) {
        data.items.forEach(collector => {
          if (collector.status) {
            expect(collector.status).toBe(1);
          }
        });
      }
    });

    test('should list collectors with field selection', async () => {
      const result = await client.callTool('lm_collector', {
        operation: 'list',
        size: 1,
        fields: 'id,description,status',
      });

      assertToolSuccess(result);
      const data = extractToolData<{ items: Array<{ id: number; description: string }> }>(result);

      if (data.items.length > 0) {
        const collector = data.items[0];
        expect(collector).toHaveProperty('id');
        expect(collector).toHaveProperty('description');
        expect(collector).toHaveProperty('status');
        expect(collector).not.toHaveProperty('hostname');
      }
    });

    test('should handle pagination with offset', async () => {
      const firstPage = await client.callTool('lm_collector', {
        operation: 'list',
        size: 2,
        offset: 0,
      });

      assertToolSuccess(firstPage);
      const firstData = extractToolData<{ items: Array<{ id: number }> }>(firstPage);

      if (firstData.items.length > 1) {
        const secondPage = await client.callTool('lm_collector', {
          operation: 'list',
          size: 2,
          offset: 2,
        });

        assertToolSuccess(secondPage);
        const secondData = extractToolData<{ items: Array<{ id: number }> }>(secondPage);

        // Verify different results if both pages have items
        if (secondData.items.length > 0) {
          expect(firstData.items[0].id).not.toBe(secondData.items[0].id);
        }
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid operation', async () => {
      const result = await client.callTool('lm_collector', {
        operation: 'create', // Not supported for collectors
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle invalid field names', async () => {
      const result = await client.callTool('lm_collector', {
        operation: 'list',
        fields: 'id,invalidFieldName',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown');
    });
  });
});

