import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { jest } from '@jest/globals';
import type { AxiosResponse } from 'axios';
import { LogicMonitorClient } from '../../src/api/client.js';
import { LogicMonitorApiError } from '../../src/api/errors.js';
import { createBearerCredentials, createListenerCredentials } from '../../src/auth/lmCredentials.js';
import { TestMCPClient } from '../utils/testClient.js';
import { assertToolSuccess, extractToolData } from '../utils/testHelpers.js';

function makeAxiosResponse(data: unknown, status = 200): AxiosResponse {
  return {
    data,
    status,
    statusText: status === 204 ? 'No Content' : 'OK',
    headers: {},
    config: {} as AxiosResponse['config'],
    request: {},
  };
}

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

describe('lm_logs', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('supports the search, result, and delete lifecycle with session-backed credentials', async () => {
    const listenerFixture = await startListenerFixture(['portal-a']);

    jest.spyOn(LogicMonitorClient.prototype, 'request').mockImplementation(async (requestConfig, requestOptions) => {
      expect(requestOptions).toEqual({
        apiVersion: '4',
        basePath: '/santaba/rest',
      });

      if (requestConfig.method === 'post' && requestConfig.url === '/log/search') {
        const payload = requestConfig.data as {
          meta: {
            queryId?: string;
            queryType?: string;
          };
        };

        if (payload.meta.queryId) {
          return makeAxiosResponse({
            meta: {
              queryId: payload.meta.queryId,
              progress: 1,
              queryType: payload.meta.queryType ?? 'raw',
            },
            data: {
              byId: {
                logs: {
                  item1: { message: 'hello from retained query' },
                },
              },
            },
          });
        }

        return makeAxiosResponse({
          meta: {
            queryId: 'query-123',
            progress: 0.5,
          },
          data: {
            byId: {},
          },
        });
      }

      if (requestConfig.method === 'delete' && requestConfig.url === '/log/search/query-123') {
        return makeAxiosResponse({ status: 'deleted' }, 204);
      }

      throw new Error(`Unexpected request: ${requestConfig.method} ${requestConfig.url}`);
    });

    const client = new TestMCPClient(
      createListenerCredentials(undefined, listenerFixture.baseUrl),
      'lm-logs-session'
    );
    await client.init();

    try {
      const searchResult = await client.callTool('lm_logs', {
        operation: 'search',
        portal: 'portal-a',
        query: 'severity:error',
        startAtMs: 1000,
        endAtMs: 2000,
      });

      assertToolSuccess(searchResult);
      const searchData = extractToolData<{
        success: boolean;
        data: {
          queryId: string;
          raw: { meta: { queryId: string } };
        };
      }>(searchResult);
      expect(searchData.success).toBe(true);
      expect(searchData.data.queryId).toBe('query-123');
      expect(searchData.data.raw.meta.queryId).toBe('query-123');
      expect(searchResult.content[0].text).toContain('session.lastLogs');

      const resultResult = await client.callTool('lm_logs', {
        operation: 'result',
        portal: 'portal-a',
        queryId: 'query-123',
        view: 'field',
      });

      assertToolSuccess(resultResult);
      const resultData = extractToolData<{
        data: {
          queryId: string;
          request: { view: string };
          raw: { data: { byId: { logs: Record<string, unknown> } } };
        };
      }>(resultResult);
      expect(resultData.data.queryId).toBe('query-123');
      expect(resultData.data.request.view).toBe('field');
      expect(resultData.data.raw.data.byId.logs.item1).toBeDefined();

      const sessionResult = await client.callTool('lm_session', {
        operation: 'get',
        key: 'lastLogsQueryId',
        portal: 'portal-a',
      });

      assertToolSuccess(sessionResult);
      const sessionData = extractToolData<{
        data: { found: boolean; value: string };
      }>(sessionResult);
      expect(sessionData.data.found).toBe(true);
      expect(sessionData.data.value).toBe('query-123');

      const deleteResult = await client.callTool('lm_logs', {
        operation: 'delete',
        portal: 'portal-a',
        queryId: 'query-123',
      });

      assertToolSuccess(deleteResult);
      const deleteData = extractToolData<{
        data: {
          cleanup: { deleted: boolean; status: number };
        };
      }>(deleteResult);
      expect(deleteData.data.cleanup).toEqual({
        deleted: true,
        queryId: 'query-123',
        status: 204,
      });
      expect(deleteResult.content[0].text).toContain('session.lastDeletedLogsQueryId');
    } finally {
      await client.close();
      await listenerFixture.close();
    }
  });

  it('returns an explicit session-required error when bearer auth is active', async () => {
    const client = new TestMCPClient(
      createBearerCredentials('acme', 'bearer-token'),
      'lm-logs-bearer'
    );
    await client.init();

    try {
      const result = await client.callTool('lm_logs', {
        operation: 'search',
        query: 'severity:error',
        startAtMs: 1000,
        endAtMs: 2000,
      });
      const expectedMessage = 'lm_logs requires session-backed credentials. Configure LM_SESSION_LISTENER_BASE_URL and target a portal with the portal argument or lm_session defaultPortal.';

      expect(result.success).toBe(false);
      expect(result.error).toBe(expectedMessage);
      expect(result.content).toHaveLength(2);
      expect(result.content[0].text).toBe(expectedMessage);
      expect(result.content[0].text).not.toContain('LogicMonitor API error');
      expect(result.data).toEqual({
        success: false,
        error: {
          code: 'SESSION_REQUIRED',
          message: expectedMessage,
          request: {
            operation: 'search',
            query: 'severity:error',
            range: {
              startAtMs: 1000,
              endAtMs: 2000,
            },
          },
        },
      });
    } finally {
      await client.close();
    }
  });

  it('preserves human-readable lm_logs API failures while exposing structured error details', async () => {
    const listenerFixture = await startListenerFixture(['portal-a']);

    jest.spyOn(LogicMonitorClient.prototype, 'request').mockRejectedValue(
      new LogicMonitorApiError('LogicMonitor API error: retained query failed', {
        code: 'LOG_QUERY_FAILED',
        status: 503,
        requestMethod: 'post',
        requestUrl: '/log/search',
        requestId: 'req-123',
      })
    );

    const client = new TestMCPClient(
      createListenerCredentials(undefined, listenerFixture.baseUrl),
      'lm-logs-api-error'
    );
    await client.init();

    try {
      const result = await client.callTool('lm_logs', {
        operation: 'search',
        portal: 'portal-a',
        query: 'severity:error',
        startAtMs: 1000,
        endAtMs: 2000,
      });
      const expectedMessage = 'LogicMonitor API error (503): LogicMonitor API error: retained query failed';

      expect(result.success).toBe(false);
      expect(result.error).toBe(expectedMessage);
      expect(result.content).toHaveLength(2);
      expect(result.content[0].text).toBe(expectedMessage);
      expect(result.data).toEqual({
        success: false,
        error: {
          code: 'LOG_QUERY_FAILED',
          message: 'LogicMonitor API error: retained query failed',
          status: 503,
          endpoint: {
            method: 'post',
            url: '/log/search',
            requestId: 'req-123',
          },
          request: {
            operation: 'search',
            portal: 'portal-a',
            query: 'severity:error',
            range: {
              startAtMs: 1000,
              endAtMs: 2000,
            },
          },
        },
      });
    } finally {
      await client.close();
      await listenerFixture.close();
    }
  });
});
