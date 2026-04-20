/**
 * Test suite for lm_session tool
 * Session management operations
 */

import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createTestClient, TestMCPClient } from '../utils/testClient.js';
import { assertToolSuccess, extractToolData } from '../utils/testHelpers.js';
import { createListenerCredentials } from '../../src/auth/lmCredentials.js';

async function startListenerFixture(portals: string[]): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server = http.createServer((request, response) => {
    if (request.url === '/api/v1/portals') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ portals }));
      return;
    }

    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not found' }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    }),
  };
}

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

  describe('Portal Capability Inspection', () => {
    test('should expose portal capability state through lm_session get and portal scope summaries', async () => {
      const listenerFixture = await startListenerFixture(['portal-a', 'portal-b']);
      const listenerClient = new TestMCPClient(
        createListenerCredentials(undefined, listenerFixture.baseUrl),
        'lm-session-capability-test'
      );
      await listenerClient.init();

      try {
        await listenerClient.callTool('lm_session', {
          operation: 'create',
          key: 'portalAKey',
          value: 'value-a',
          portal: 'portal-a',
        });

        await listenerClient.callTool('lm_session', {
          operation: 'create',
          key: 'portalBKey',
          value: 'value-b',
          portal: 'portal-b',
        });

        const portalResult = await listenerClient.callTool('lm_session', {
          operation: 'get',
          portal: 'portal-a',
        });

        assertToolSuccess(portalResult);
        const portalResponse = extractToolData<{
          data: {
            portal: string;
            capabilities: {
              sessionBackedApiV4: boolean;
              lmLogs: boolean;
            };
            variables: Record<string, unknown>;
          };
        }>(portalResult);

        expect(portalResponse.data.portal).toBe('portal-a');
        expect(portalResponse.data.capabilities).toEqual({
          sessionBackedApiV4: true,
          lmLogs: true,
        });
        expect(portalResponse.data.variables).toEqual({ portalAKey: 'value-a' });
        expect(portalResponse.data).not.toHaveProperty('credentialsIdentity');
        expect(portalResponse.data).not.toHaveProperty('jSessionId');
        expect(portalResponse.data).not.toHaveProperty('csrfToken');

        const sessionResult = await listenerClient.callTool('lm_session', {
          operation: 'get',
        });

        assertToolSuccess(sessionResult);
        const sessionResponse = extractToolData<{
          data: {
            availablePortals?: string[];
            portalScopes: Array<{
              portal: string;
              capabilities: {
                sessionBackedApiV4: boolean;
                lmLogs: boolean;
              };
              storedVariables: string[];
            }>;
          };
        }>(sessionResult);

        expect(sessionResponse.data.availablePortals).toEqual(['portal-a', 'portal-b']);

        const scopesByPortal = Object.fromEntries(
          sessionResponse.data.portalScopes.map((scope) => [scope.portal, scope])
        );

        expect(scopesByPortal['portal-a']).toEqual(expect.objectContaining({
          availableResultKeys: expect.arrayContaining(['lm_session']),
          historyEntries: expect.any(Number),
          storedVariables: ['portalAKey'],
          capabilities: {
            sessionBackedApiV4: true,
            lmLogs: true,
          },
        }));
        expect(scopesByPortal['portal-b']).toEqual(expect.objectContaining({
          availableResultKeys: expect.arrayContaining(['lm_session']),
          historyEntries: expect.any(Number),
          storedVariables: ['portalBKey'],
          capabilities: {
            sessionBackedApiV4: true,
            lmLogs: true,
          },
        }));
        expect(scopesByPortal['portal-a'].historyEntries).toBeGreaterThan(0);
        expect(scopesByPortal['portal-b'].historyEntries).toBeGreaterThan(0);
      } finally {
        await listenerClient.close();
        await listenerFixture.close();
      }
    });

    test('should reject unknown portal-scoped lm_session inspection when listener portals are known', async () => {
      const listenerFixture = await startListenerFixture(['portal-a']);
      const listenerClient = new TestMCPClient(
        createListenerCredentials(undefined, listenerFixture.baseUrl),
        'lm-session-invalid-portal-test'
      );
      await listenerClient.init();

      try {
        const result = await listenerClient.callTool('lm_session', {
          operation: 'get',
          portal: 'portal-missing',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("Unknown LogicMonitor portal 'portal-missing'");
        expect(result.error).toContain('portal-a');
      } finally {
        await listenerClient.close();
        await listenerFixture.close();
      }
    });

    test('should report portal-scoped delete state after scoped mirroring has been applied', async () => {
      const listenerFixture = await startListenerFixture(['portal-a']);
      const listenerClient = new TestMCPClient(
        createListenerCredentials(undefined, listenerFixture.baseUrl),
        'lm-session-portal-delete-test'
      );
      await listenerClient.init();

      try {
        await listenerClient.callTool('lm_session', {
          operation: 'create',
          key: 'portalDeleteKey',
          value: 'value-a',
          portal: 'portal-a',
        });

        const deleteResult = await listenerClient.callTool('lm_session', {
          operation: 'delete',
          scope: 'all',
          portal: 'portal-a',
        });

        assertToolSuccess(deleteResult);
        const deleteResponse = extractToolData<{
          data: {
            remainingVariables: string[];
            remainingResultKeys: string[];
            historyEntries: number;
          };
        }>(deleteResult);

        const snapshotResult = await listenerClient.callTool('lm_session', {
          operation: 'get',
          portal: 'portal-a',
        });

        assertToolSuccess(snapshotResult);
        const snapshotResponse = extractToolData<{
          data: {
            variables: Record<string, unknown>;
            lastResults: string[];
            history: unknown[];
          };
        }>(snapshotResult);

        expect(deleteResponse.data.remainingVariables).toEqual(Object.keys(snapshotResponse.data.variables));
        expect(deleteResponse.data.remainingResultKeys).toEqual(snapshotResponse.data.lastResults);
        expect(deleteResponse.data.historyEntries).toBe(snapshotResponse.data.history.length);
        expect(deleteResponse.data.remainingResultKeys).toContain('lm_session');
        expect(deleteResponse.data.historyEntries).toBeGreaterThan(0);
      } finally {
        await listenerClient.close();
        await listenerFixture.close();
      }
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
