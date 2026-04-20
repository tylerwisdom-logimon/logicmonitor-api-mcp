import http from 'http';
import { once } from 'events';
import { AxiosError, AxiosHeaders } from 'axios';
import { LogicMonitorClient } from '../../../src/api/client.js';
import { createBearerCredentials, createSessionCredentials } from '../../../src/auth/lmCredentials.js';

describe('LogicMonitorClient session auth', () => {
  async function withListener(
    handler: http.RequestListener,
    testFn: (baseUrl: string) => Promise<void>
  ): Promise<void> {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');

    const address = server.address();
    if (!address || typeof address === 'string') {
      server.close();
      throw new Error('Failed to bind test listener');
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      await testFn(baseUrl);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  }

  it('prepares session-authenticated requests with portal-specific headers and base URL', async () => {
    await withListener((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        data: {
          jSessionID: 'jsession-123',
          token: 'csrf-456',
          domain: 'secure.lmgov.us',
        }
      }));
    }, async (baseUrl) => {
      const credentials = createSessionCredentials('gov', baseUrl);
      const client = new LogicMonitorClient(credentials);

      const requestConfig = await (client as unknown as {
        attachSessionAuth: (
          creds: typeof credentials,
          timeoutMs: number,
          request: { headers?: Record<string, string> }
        ) => Promise<{ baseURL?: string; headers: { get: (key: string) => string | undefined } }>;
      }).attachSessionAuth(credentials, 1000, { headers: {} });

      expect(requestConfig.baseURL).toBe('https://gov.lmgov.us/santaba/rest');
      expect(requestConfig.headers.get('cookie')).toBe('JSESSIONID=jsession-123;');
      expect(requestConfig.headers.get('x-csrf-token')).toBe('csrf-456');
      expect(client.getPortalUiBaseUrl()).toBe('https://gov.lmgov.us/santaba/uiv4');
    });
  });

  it('allows a session-backed client request to override the API version without changing the default v3 path', async () => {
    await withListener((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        data: {
          jSessionID: 'jsession-456',
          token: 'csrf-789',
          domain: 'secure.lmgov.us',
        }
      }));
    }, async (baseUrl) => {
      const credentials = createSessionCredentials('gov', baseUrl);
      const client = new LogicMonitorClient(credentials);
      const capturedRequests: Array<{ baseURL?: string; url?: string; headers: AxiosHeaders }> = [];
      (client as unknown as {
        axiosInstance: {
          defaults: {
            adapter: (config: unknown) => Promise<unknown>;
          };
        };
      }).axiosInstance.defaults.adapter = async (config) => {
        const requestConfig = config as { baseURL?: string; url?: string; headers?: unknown };
        capturedRequests.push({
          baseURL: requestConfig.baseURL,
          url: requestConfig.url,
          headers: AxiosHeaders.from(requestConfig.headers ?? {})
        });

        return {
          data: { ok: true },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          request: {}
        };
      };

      await client.request(
        { method: 'get', url: '/device/devices' },
        {
          apiVersion: '4',
          basePath: '/santaba/uiv4',
          headers: {
            Authorization: 'Bearer override',
            Cookie: 'bad-cookie',
            'Content-Type': 'text/plain',
            'X-Version': '4',
            'x-csrf-token': 'bad-token',
            'x-extra': 'present'
          }
        }
      );

      await client.request({ method: 'get', url: '/device/devices' });

      expect(capturedRequests[0]).toMatchObject({
        baseURL: 'https://gov.lmgov.us/santaba/uiv4',
        url: '/device/devices'
      });
      expect(capturedRequests[0].headers.get('authorization')).toBeUndefined();
      expect(capturedRequests[0].headers.get('content-type')).toBe('application/json');
      expect(capturedRequests[0].headers.get('x-version')).toBe('4');
      expect(capturedRequests[0].headers.get('cookie')).toBe('JSESSIONID=jsession-456;');
      expect(capturedRequests[0].headers.get('x-csrf-token')).toBe('csrf-789');
      expect(capturedRequests[0].headers.get('x-extra')).toBe('present');

      expect(capturedRequests[1]).toMatchObject({
        baseURL: 'https://gov.lmgov.us/santaba/rest',
        url: '/device/devices'
      });
      expect(capturedRequests[1].headers.get('x-version')).toBe('3');
    });
  });

  it('applies low-level request options consistently for bearer requests without letting them override auth headers', async () => {
    const credentials = createBearerCredentials('acme', 'bearer-token');
    const client = new LogicMonitorClient(credentials);
    const capturedRequests: Array<{ baseURL?: string; url?: string; headers: AxiosHeaders }> = [];
    (client as unknown as {
      axiosInstance: {
        defaults: {
          adapter: (config: unknown) => Promise<unknown>;
        };
      };
    }).axiosInstance.defaults.adapter = async (config) => {
      const requestConfig = config as { baseURL?: string; url?: string; headers?: unknown };
      capturedRequests.push({
        baseURL: requestConfig.baseURL,
        url: requestConfig.url,
        headers: AxiosHeaders.from(requestConfig.headers ?? {})
      });

      return {
        data: { ok: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
        request: {}
      };
    };

    await client.request(
      { method: 'get', url: '/device/devices' },
      {
        apiVersion: '4',
        basePath: '/santaba/uiv4',
        headers: {
          Authorization: 'Bearer override',
          Cookie: 'bad-cookie',
          'Content-Type': 'text/plain',
          'X-Version': '9',
          'x-csrf-token': 'bad-token',
          'x-extra': 'present'
        }
      }
    );

    expect(capturedRequests[0]).toMatchObject({
      baseURL: 'https://acme.logicmonitor.com/santaba/uiv4',
      url: '/device/devices'
    });
    expect(capturedRequests[0].headers.get('authorization')).toBe('Bearer bearer-token');
    expect(capturedRequests[0].headers.get('content-type')).toBe('application/json');
    expect(capturedRequests[0].headers.get('x-version')).toBe('4');
    expect(capturedRequests[0].headers.get('cookie')).toBeUndefined();
    expect(capturedRequests[0].headers.get('x-csrf-token')).toBeUndefined();
    expect(capturedRequests[0].headers.get('x-extra')).toBe('present');
  });

  it('invalidates a cached session after a 401 so the next request refetches the listener session', async () => {
    let sessionRequestCount = 0;

    await withListener((_req, res) => {
      sessionRequestCount += 1;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        data: {
          jSessionID: 'jsession-401',
          token: 'csrf-401',
          domain: 'secure.lmgov.us',
        }
      }));
    }, async (baseUrl) => {
      const credentials = createSessionCredentials('gov', baseUrl);
      const client = new LogicMonitorClient(credentials);
      let requestCount = 0;

      (client as unknown as {
        axiosInstance: {
          defaults: {
            adapter: (config: unknown) => Promise<unknown>;
          };
        };
      }).axiosInstance.defaults.adapter = async (config) => {
        requestCount += 1;
        const requestConfig = config as { baseURL?: string; url?: string };

        if (requestCount === 1) {
          throw new AxiosError(
            'Request failed with status code 401',
            'ERR_BAD_REQUEST',
            config as never,
            {},
            {
              data: { errorMessage: 'Unauthorized' },
              status: 401,
              statusText: 'Unauthorized',
              headers: {},
              config: config as never,
              request: {}
            }
          );
        }

        expect(requestConfig.baseURL).toBe('https://gov.lmgov.us/santaba/rest');
        expect(requestConfig.url).toBe('/device/devices');

        return {
          data: { ok: true },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          request: {}
        };
      };

      await expect(client.request({ method: 'get', url: '/device/devices' })).rejects.toMatchObject({
        name: 'LogicMonitorApiError',
        status: 401
      });

      await client.request({ method: 'get', url: '/device/devices' });

      expect(sessionRequestCount).toBe(2);
    });
  });
});
