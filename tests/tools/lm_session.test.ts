/**
 * Test suite for lm_session tool
 * Session management operations
 */

import { createTestClient, TestMCPClient } from '../utils/testClient.js';
import { assertToolSuccess, extractToolData } from '../utils/testHelpers.js';

describe('lm_session', () => {
  let client: TestMCPClient;

  beforeAll(async () => {
    client = await createTestClient('lm-session-test-session');
  });

  beforeEach(() => {
    // Clear session before each test
    client.clearSession();
  });

  describe('Create Operations (Set Variable)', () => {
    test('should set a string variable', async () => {
      const result = await client.callTool('lm_session', {
        operation: 'create',
        key: 'testString',
        value: 'test value',
      });

      assertToolSuccess(result);
      const response = extractToolData<{ data: { success: boolean; message: string } }>(result);

      expect(response.data.success).toBe(true);
      expect(response.data.message).toContain('Stored session variable');
    });

    test('should set a number variable', async () => {
      const result = await client.callTool('lm_session', {
        operation: 'create',
        key: 'testNumber',
        value: 42,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ success: boolean }>(result);

      expect(data.success).toBe(true);
    });

    test('should set an object variable', async () => {
      const testObject = { foo: 'bar', nested: { value: 123 } };

      const result = await client.callTool('lm_session', {
        operation: 'create',
        key: 'testObject',
        value: testObject,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ success: boolean }>(result);

      expect(data.success).toBe(true);
    });

    test('should set an array variable', async () => {
      const testArray = [1, 2, 3, 4, 5];

      const result = await client.callTool('lm_session', {
        operation: 'create',
        key: 'testArray',
        value: testArray,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ success: boolean }>(result);

      expect(data.success).toBe(true);
    });
  });

  describe('Get Operations', () => {
    beforeEach(async () => {
      // Set some test variables
      await client.callTool('lm_session', {
        operation: 'create',
        key: 'var1',
        value: 'value1',
      });
      await client.callTool('lm_session', {
        operation: 'create',
        key: 'var2',
        value: { nested: 'object' },
      });
    });

    test('should get specific variable', async () => {
      const result = await client.callTool('lm_session', {
        operation: 'get',
        key: 'var1',
      });

      assertToolSuccess(result);
      const response = extractToolData<{ data: { found: boolean; key: string; value: string } }>(result);

      expect(response.data.found).toBe(true);
      expect(response.data.key).toBe('var1');
      expect(response.data.value).toBe('value1');
    });

    test('should return not found for non-existent variable', async () => {
      const result = await client.callTool('lm_session', {
        operation: 'get',
        key: 'nonExistentVar',
      });

      assertToolSuccess(result);
      const response = extractToolData<{ data: { found: boolean; message: string } }>(result);

      expect(response.data.found).toBe(false);
      expect(response.data.message).toContain('was found');
    });

    test('should get full session context', async () => {
      const result = await client.callTool('lm_session', {
        operation: 'get',
      });

      assertToolSuccess(result);
      const response = extractToolData<{ 
        data: {
          sessionId: string;
          variables: Record<string, unknown>;
          lastResults: unknown;
        }
      }>(result);

      expect(response.data).toHaveProperty('sessionId');
      expect(response.data).toHaveProperty('variables');
      expect(response.data).toHaveProperty('lastResults');
      expect(Object.keys(response.data.variables).length).toBeGreaterThan(0);
    });

    test('should get context with history limit', async () => {
      const result = await client.callTool('lm_session', {
        operation: 'get',
        historyLimit: 5,
      });

      assertToolSuccess(result);
      const response = extractToolData<{ data: { history: unknown[] } }>(result);

      expect(response.data).toHaveProperty('history');
      expect(Array.isArray(response.data.history)).toBe(true);
    });
  });

  describe('Update Operations', () => {
    test('should update existing variable', async () => {
      // Create initial variable
      await client.callTool('lm_session', {
        operation: 'create',
        key: 'updateTest',
        value: 'initial value',
      });

      // Update it
      const result = await client.callTool('lm_session', {
        operation: 'update',
        key: 'updateTest',
        value: 'updated value',
      });

      assertToolSuccess(result);
      const response = extractToolData<{ data: { success: boolean; message: string } }>(result);

      expect(response.data.success).toBe(true);
      expect(response.data.message).toContain('Updated session variable');

      // Verify the update
      const getResult = await client.callTool('lm_session', {
        operation: 'get',
        key: 'updateTest',
      });

      assertToolSuccess(getResult);
      const getResponse = extractToolData<{ data: { value: string } }>(getResult);
      expect(getResponse.data.value).toBe('updated value');
    });

    test('should update variable type', async () => {
      // Create as string
      await client.callTool('lm_session', {
        operation: 'create',
        key: 'typeTest',
        value: 'string value',
      });

      // Update to number
      const result = await client.callTool('lm_session', {
        operation: 'update',
        key: 'typeTest',
        value: 123,
      });

      assertToolSuccess(result);

      // Verify
      const getResult = await client.callTool('lm_session', {
        operation: 'get',
        key: 'typeTest',
      });

      assertToolSuccess(getResult);
      const getResponse = extractToolData<{ data: { value: number } }>(getResult);
      expect(getResponse.data.value).toBe(123);
    });
  });

  describe('List Operations (History)', () => {
    test('should list session history', async () => {
      // Perform some operations to create history
      await client.callTool('lm_session', {
        operation: 'create',
        key: 'historyTest1',
        value: 'value1',
      });
      await client.callTool('lm_session', {
        operation: 'create',
        key: 'historyTest2',
        value: 'value2',
      });

      const result = await client.callTool('lm_session', {
        operation: 'list',
      });

      assertToolSuccess(result);
      const response = extractToolData<{ 
        data: {
          history: Array<{ tool: string; timestamp: string }>;
          availableResultKeys: unknown;
        }
      }>(result);

      expect(response.data).toHaveProperty('history');
      expect(Array.isArray(response.data.history)).toBe(true);
      expect(response.data.history.length).toBeGreaterThan(0);
    });

    test('should list history with limit', async () => {
      const result = await client.callTool('lm_session', {
        operation: 'list',
        limit: 3,
      });

      assertToolSuccess(result);
      const response = extractToolData<{ data: { history: unknown[] } }>(result);

      expect(response.data.history.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Delete Operations (Clear Context)', () => {
    beforeEach(async () => {
      // Set up some session data
      await client.callTool('lm_session', {
        operation: 'create',
        key: 'clearTest1',
        value: 'value1',
      });
      await client.callTool('lm_session', {
        operation: 'create',
        key: 'clearTest2',
        value: 'value2',
      });
    });

    test('should clear all session context', async () => {
      const result = await client.callTool('lm_session', {
        operation: 'delete',
        scope: 'all',
      });

      assertToolSuccess(result);
      const response = extractToolData<{ 
        data: {
          success: boolean;
          cleared: string;
          remainingVariables: string[];
        }
      }>(result);

      expect(response.data.success).toBe(true);
      expect(response.data.cleared).toBe('all');
      expect(response.data.remainingVariables.length).toBe(0);
    });

    test('should clear only variables', async () => {
      const result = await client.callTool('lm_session', {
        operation: 'delete',
        scope: 'variables',
      });

      assertToolSuccess(result);
      const response = extractToolData<{ 
        data: {
          success: boolean;
          cleared: string;
          remainingVariables: string[];
        }
      }>(result);

      expect(response.data.success).toBe(true);
      expect(response.data.cleared).toBe('variables');
      expect(response.data.remainingVariables.length).toBe(0);
    });

    test('should clear only history', async () => {
      const result = await client.callTool('lm_session', {
        operation: 'delete',
        scope: 'history',
      });

      assertToolSuccess(result);
      const response = extractToolData<{ 
        data: {
          success: boolean;
          cleared: string;
          historyEntries: number;
        }
      }>(result);

      expect(response.data.success).toBe(true);
      expect(response.data.cleared).toBe('history');
      expect(response.data.historyEntries).toBe(0);
    });

    test('should clear only results', async () => {
      const result = await client.callTool('lm_session', {
        operation: 'delete',
        scope: 'results',
      });

      assertToolSuccess(result);
      const response = extractToolData<{ 
        data: {
          success: boolean;
          cleared: string;
          remainingResultKeys: string[];
        }
      }>(result);

      expect(response.data.success).toBe(true);
      expect(response.data.cleared).toBe('results');
      expect(response.data.remainingResultKeys.length).toBe(0);
    });
  });

  describe('Session Persistence', () => {
    test('should persist variables across operations', async () => {
      // Set a variable
      await client.callTool('lm_session', {
        operation: 'create',
        key: 'persistTest',
        value: 'persistent value',
      });

      // Perform other operations
      await client.callTool('lm_session', {
        operation: 'list',
      });

      // Verify variable still exists
      const result = await client.callTool('lm_session', {
        operation: 'get',
        key: 'persistTest',
      });

      assertToolSuccess(result);
      const response = extractToolData<{ data: { found: boolean; value: string } }>(result);

      expect(response.data.found).toBe(true);
      expect(response.data.value).toBe('persistent value');
    });
  });

  describe('Error Handling', () => {
    test('should handle missing key for create', async () => {
      const result = await client.callTool('lm_session', {
        operation: 'create',
        value: 'value without key',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle missing value for create', async () => {
      const result = await client.callTool('lm_session', {
        operation: 'create',
        key: 'keyWithoutValue',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle invalid scope for delete', async () => {
      const result = await client.callTool('lm_session', {
        operation: 'delete',
        scope: 'invalid_scope',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

