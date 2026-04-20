import { jest } from '@jest/globals';
import type { AxiosResponse } from 'axios';
import type { LogicMonitorClient } from '../../../../src/api/client.js';
import { LogsHandler } from '../../../../src/resources/logs/logsHandler.js';
import { SessionManager } from '../../../../src/session/sessionManager.js';

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

describe('LogsHandler', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager();
    jest.restoreAllMocks();
  });

  it('submits search requests through the v4 logs endpoint and stores the returned query state', async () => {
    const request = jest.fn().mockResolvedValue(
      makeAxiosResponse({
        meta: {
          queryId: 'query-123',
          progress: 0.25,
          cursor: 'cursor-1',
        },
        data: {
          byId: {
            logs: {
              item1: { message: 'hello' },
            },
          },
        },
      })
    );

    const handler = new LogsHandler(
      {
        request,
        getAccount: () => 'portal-a',
      } as unknown as LogicMonitorClient,
      sessionManager,
      'logs-session'
    );

    const result = await handler.handleOperation({
      operation: 'search',
      portal: 'portal-a',
      query: 'error',
      startAtMs: 1000,
      endAtMs: 2000,
      executionMode: 'async',
    } as never);

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'post',
        url: '/log/search',
        data: {
          meta: {
            isAsync: true,
            perPageCount: 100,
            filter: {
              query: 'error',
              range: {
                startAtMS: 1000,
                endAtMS: 2000,
              },
            },
          },
        },
      }),
      {
        apiVersion: '4',
        basePath: '/santaba/rest',
      }
    );

    expect(result).toMatchObject({
      success: true,
      data: {
        surface: 'lm_logs',
        operation: 'search',
        portal: 'portal-a',
        apiVersion: '4',
        queryId: 'query-123',
        request: {
          portal: 'portal-a',
          query: 'error',
          range: {
            startAtMs: 1000,
            endAtMs: 2000,
          },
          executionMode: 'async',
        },
        responseMeta: {
          endpoint: '/log/search',
          method: 'post',
          status: 200,
          payloadMeta: {
            queryId: 'query-123',
            progress: 0.25,
            cursor: 'cursor-1',
          },
        },
        raw: {
          meta: {
            queryId: 'query-123',
            progress: 0.25,
          },
        },
      },
    });

    const scopedContext = sessionManager.getContext('logs-session');
    expect(scopedContext.variables.lastLogsQueryId).toBe('query-123');
    expect(scopedContext.variables.lastLogs).toMatchObject({
      operation: 'search',
      queryId: 'query-123',
    });
  });

  it('resumes query results with a retained query id and requested view', async () => {
    const request = jest.fn().mockResolvedValue(
      makeAxiosResponse({
        meta: {
          queryId: 'query-123',
          progress: 1,
          queryType: 'aggregate',
        },
        data: {
          byId: {
            aggregate: [{ count: 3 }],
          },
        },
      })
    );

    const handler = new LogsHandler(
      {
        request,
        getAccount: () => 'portal-a',
      } as unknown as LogicMonitorClient,
      sessionManager,
      'logs-session'
    );

    const result = await handler.handleOperation({
      operation: 'result',
      portal: 'portal-a',
      queryId: 'query-123',
      query: 'error',
      startAtMs: 1000,
      endAtMs: 2000,
      view: 'aggregate',
      executionMode: 'sync',
    } as never);

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'post',
        url: '/log/search',
        data: {
          meta: {
            isAsync: false,
            perPageCount: 100,
            queryId: 'query-123',
            queryType: 'aggregate',
            filter: {
              query: 'error',
              range: {
                startAtMS: 1000,
                endAtMS: 2000,
              },
            },
          },
        },
      }),
      {
        apiVersion: '4',
        basePath: '/santaba/rest',
      }
    );

    expect(result).toMatchObject({
      success: true,
      data: {
        operation: 'result',
        queryId: 'query-123',
        request: {
          queryId: 'query-123',
          query: 'error',
          view: 'aggregate',
          executionMode: 'sync',
        },
        responseMeta: {
          payloadMeta: {
            queryId: 'query-123',
            progress: 1,
            queryType: 'aggregate',
          },
        },
      },
    });
  });

  it('supports the field view for retained result queries', async () => {
    const request = jest.fn().mockResolvedValue(
      makeAxiosResponse({
        meta: {
          queryId: 'query-456',
          progress: 1,
          queryType: 'field',
        },
        data: {
          byId: {
            field: [{ name: 'severity' }],
          },
        },
      })
    );

    const handler = new LogsHandler(
      {
        request,
        getAccount: () => 'portal-a',
      } as unknown as LogicMonitorClient,
      sessionManager,
      'logs-session'
    );

    const result = await handler.handleOperation({
      operation: 'result',
      portal: 'portal-a',
      queryId: 'query-456',
      view: 'field',
    } as never);

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'post',
        url: '/log/search',
        data: {
          meta: {
            isAsync: true,
            perPageCount: 100,
            queryId: 'query-456',
            queryType: 'field',
          },
        },
      }),
      {
        apiVersion: '4',
        basePath: '/santaba/rest',
      }
    );

    expect(result).toMatchObject({
      success: true,
      data: {
        operation: 'result',
        queryId: 'query-456',
        request: {
          queryId: 'query-456',
          view: 'field',
          executionMode: 'async',
        },
        responseMeta: {
          payloadMeta: {
            queryId: 'query-456',
            queryType: 'field',
          },
        },
      },
    });
  });

  it('rejects a query-only retained result request without a time window', async () => {
    const request = jest.fn();

    const handler = new LogsHandler(
      {
        request,
        getAccount: () => 'portal-a',
      } as unknown as LogicMonitorClient,
      sessionManager,
      'logs-session'
    );

    await expect(handler.handleOperation({
      operation: 'result',
      portal: 'portal-a',
      queryId: 'query-789',
      query: 'severity:error',
      view: 'raw',
    } as never)).rejects.toThrow(
      "Validation error: startAtMs: query requires both startAtMs and endAtMs"
    );

    expect(request).not.toHaveBeenCalled();
  });

  it('cleans up retained queries through DELETE /log/search/{queryId}', async () => {
    const request = jest.fn().mockResolvedValue(
      makeAxiosResponse({ status: 'deleted' }, 204)
    );

    const handler = new LogsHandler(
      {
        request,
        getAccount: () => 'portal-a',
      } as unknown as LogicMonitorClient,
      sessionManager,
      'logs-session'
    );

    const result = await handler.handleOperation({
      operation: 'delete',
      portal: 'portal-a',
      queryId: 'query-123',
    } as never);

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'delete',
        url: '/log/search/query-123',
      }),
      {
        apiVersion: '4',
        basePath: '/santaba/rest',
      }
    );

    expect(result).toMatchObject({
      success: true,
      data: {
        surface: 'lm_logs',
        operation: 'delete',
        queryId: 'query-123',
        cleanup: {
          deleted: true,
          queryId: 'query-123',
          status: 204,
        },
      },
    });

    const scopedContext = sessionManager.getContext('logs-session');
    expect(scopedContext.variables.lastDeletedLogsQueryId).toBe('query-123');
  });
});
