/**
 * Test suite for lm_opsnote tool
 * OpsNote (operational notes) operations
 */

import { createTestClient, TestMCPClient } from '../utils/testClient.js';
import { assertToolSuccess, extractToolData } from '../utils/testHelpers.js';

describe('lm_opsnote', () => {
  let client: TestMCPClient;

  beforeAll(async () => {
    client = await createTestClient('lm-opsnote-test-session');
  });

  describe('List Operations', () => {
    test('should list opsnotes with default parameters', async () => {
      const result = await client.callTool('lm_opsnote', {
        operation: 'list',
      });

      assertToolSuccess(result);
      const data = extractToolData<{ success: boolean; items: unknown[]; total: number }>(result);

      expect(data.success).toBe(true);
      expect(Array.isArray(data.items)).toBe(true);
      expect(typeof data.total).toBe('number');
    });

    test('should list opsnotes with size limit', async () => {
      const result = await client.callTool('lm_opsnote', {
        operation: 'list',
        size: 5,
        autoPaginate: false,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ items: unknown[] }>(result);

      expect(Array.isArray(data.items)).toBe(true);
      expect(data.items.length).toBeLessThanOrEqual(5);
    });

    test('should list opsnotes with filter', async () => {
      const result = await client.callTool('lm_opsnote', {
        operation: 'list',
        filter: '_all:"*"',
      });

      assertToolSuccess(result);
      const data = extractToolData<{ items: unknown[] }>(result);

      expect(Array.isArray(data.items)).toBe(true);
    });

    test('should list opsnotes with field selection', async () => {
      const result = await client.callTool('lm_opsnote', {
        operation: 'list',
        size: 1,
        fields: 'id,note,createdBy',
      });

      assertToolSuccess(result);
      const data = extractToolData<{ items: Array<{ id: string; note: string }> }>(result);

      if (data.items.length > 0) {
        const note = data.items[0];
        expect(note).toHaveProperty('id');
        expect(note).toHaveProperty('note');
      }
    });

    test('should handle pagination with offset', async () => {
      const firstPage = await client.callTool('lm_opsnote', {
        operation: 'list',
        size: 2,
        offset: 0,
      });

      assertToolSuccess(firstPage);
      const firstData = extractToolData<{ items: Array<{ id: string }> }>(firstPage);

      if (firstData.items.length > 1) {
        const secondPage = await client.callTool('lm_opsnote', {
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
      const result = await client.callTool('lm_opsnote', {
        operation: 'list',
        fields: 'id,invalidFieldName',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown');
    });
  });
});
