import { jest } from '@jest/globals';
import type { AxiosResponse } from 'axios';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import winston from 'winston';
import { LogicMonitorClient } from '../../../src/api/client.js';
import { createListenerCredentials, createSessionCredentials, serializeCredentialsIdentity } from '../../../src/auth/lmCredentials.js';
import { createServer } from '../../../src/server.js';
import { buildScopedSessionId, listPortalScopes } from '../../../src/session/portalSessionState.js';
import { SessionManager } from '../../../src/session/sessionManager.js';

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

describe('multi-portal session isolation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps applyToPrevious state isolated per portal within the same MCP session', async () => {
    jest.spyOn(LogicMonitorClient.prototype, 'listDevices').mockImplementation(async function () {
      const portal = this.getAccount();
      const deviceId = portal === 'portal-a' ? 101 : 202;

      return {
        items: [{ id: deviceId, displayName: `${portal}-device` }],
        total: 1,
        raw: { items: [{ id: deviceId }] },
        meta: {
          endpoint: '/device/devices',
          method: 'get',
          status: 200,
          timestamp: new Date().toISOString(),
        },
      };
    });

    const sessionManager = new SessionManager();
    const logger = winston.createLogger({
      level: 'error',
      transports: [new winston.transports.Console({ silent: true })],
    });

    const { server } = await createServer({
      credentials: createListenerCredentials(undefined, 'http://127.0.0.1:8072'),
      sessionManager,
      logger,
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    serverTransport.sessionId = 'shared-session';
    await server.server.connect(serverTransport);

    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(clientTransport);

    await client.callTool({
      name: 'lm_device',
      arguments: {
        operation: 'list',
        portal: 'portal-a',
      },
    });

    await client.callTool({
      name: 'lm_device',
      arguments: {
        operation: 'list',
        portal: 'portal-b',
      },
    });

    const portalASessionId = buildScopedSessionId(
      'shared-session',
      serializeCredentialsIdentity(createSessionCredentials('portal-a', 'http://127.0.0.1:8072'))
    );
    const portalBSessionId = buildScopedSessionId(
      'shared-session',
      serializeCredentialsIdentity(createSessionCredentials('portal-b', 'http://127.0.0.1:8072'))
    );

    expect(sessionManager.getContext(portalASessionId).variables.lastDeviceListIds).toEqual([101]);
    expect(sessionManager.getContext(portalBSessionId).variables.lastDeviceListIds).toEqual([202]);
    expect(listPortalScopes(sessionManager, 'shared-session').map(scope => scope.portal)).toEqual([
      'portal-a',
      'portal-b',
    ]);

    await client.close();
    await server.close();
  });

  it('keeps lm_logs state isolated per portal within the same MCP session', async () => {
    jest.spyOn(LogicMonitorClient.prototype, 'request').mockImplementation(async function (requestConfig) {
      const portal = this.getAccount();

      if (requestConfig.method === 'post' && requestConfig.url === '/log/search') {
        return makeAxiosResponse({
          meta: {
            queryId: `query-${portal}`,
            progress: 0.5,
          },
          data: {
            byId: {},
          },
        });
      }

      throw new Error(`Unexpected request: ${requestConfig.method} ${requestConfig.url}`);
    });

    const sessionManager = new SessionManager();
    const logger = winston.createLogger({
      level: 'error',
      transports: [new winston.transports.Console({ silent: true })],
    });

    const { server } = await createServer({
      credentials: createListenerCredentials(undefined, 'http://127.0.0.1:8072'),
      sessionManager,
      logger,
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    serverTransport.sessionId = 'shared-session';
    await server.server.connect(serverTransport);

    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(clientTransport);

    await client.callTool({
      name: 'lm_logs',
      arguments: {
        operation: 'search',
        portal: 'portal-a',
        query: 'severity:error',
        startAtMs: 1000,
        endAtMs: 2000,
      },
    });

    await client.callTool({
      name: 'lm_logs',
      arguments: {
        operation: 'search',
        portal: 'portal-b',
        query: 'severity:warning',
        startAtMs: 3000,
        endAtMs: 4000,
      },
    });

    const portalASessionId = buildScopedSessionId(
      'shared-session',
      serializeCredentialsIdentity(createSessionCredentials('portal-a', 'http://127.0.0.1:8072'))
    );
    const portalBSessionId = buildScopedSessionId(
      'shared-session',
      serializeCredentialsIdentity(createSessionCredentials('portal-b', 'http://127.0.0.1:8072'))
    );

    expect(sessionManager.getContext(portalASessionId).variables.lastLogsQueryId).toBe('query-portal-a');
    expect(sessionManager.getContext(portalASessionId).variables.lastLogs).toEqual(expect.objectContaining({
      queryId: 'query-portal-a',
    }));
    expect(sessionManager.getContext(portalBSessionId).variables.lastLogsQueryId).toBe('query-portal-b');
    expect(sessionManager.getContext(portalBSessionId).variables.lastLogs).toEqual(expect.objectContaining({
      queryId: 'query-portal-b',
    }));
    expect(Object.keys(sessionManager.getContext(portalASessionId).lastResults)).toContain('lm_logs');
    expect(Object.keys(sessionManager.getContext(portalBSessionId).lastResults)).toContain('lm_logs');
    expect(
      (sessionManager.getContext(portalASessionId).lastResults.lm_logs as { data: { queryId: string } }).data.queryId
    ).toBe('query-portal-a');
    expect(
      (sessionManager.getContext(portalBSessionId).lastResults.lm_logs as { data: { queryId: string } }).data.queryId
    ).toBe('query-portal-b');
    expect(listPortalScopes(sessionManager, 'shared-session').map(scope => scope.portal)).toEqual([
      'portal-a',
      'portal-b',
    ]);

    await client.close();
    await server.close();
  });
});
