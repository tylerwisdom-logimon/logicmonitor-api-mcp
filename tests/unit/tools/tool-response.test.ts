/**
 * Unit tests for buildToolResponse — the H1 response token bloat changes.
 * Pure unit tests: no API calls, no credentials needed.
 */

import { buildToolResponse } from '../../../src/tools/utils/tool-response.js';
import { buildToolErrorResponse } from '../../../src/tools/utils/tool-response.js';
import { LogicMonitorApiError, LogicMonitorUsageError } from '../../../src/api/errors.js';
import type { OperationResult } from '../../../src/types/operations.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Join all text content blocks into one string for assertions. */
function textOf(response: ReturnType<typeof buildToolResponse>): string {
  return response.content.map(c => c.text).join('\n');
}

function makeDeviceItems(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    displayName: `device-${i + 1}`,
    hostStatus: i % 2 === 0 ? 'alive' : 'dead',
    name: `device-${i + 1}.example.com`,
    preferredCollectorId: 100 + i,
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildToolResponse', () => {
  const deviceConfig = {
    resourceName: 'device',
    resourceTitle: 'LogicMonitor device',
  };

  // 1. list (small <= 5 items) — full JSON included
  it('includes full JSON payload for small list (<=5 items)', () => {
    const result: OperationResult<unknown> = {
      success: true,
      items: makeDeviceItems(3),
      total: 3,
    };

    const response = buildToolResponse({ operation: 'list' }, result, deviceConfig);
    const text = textOf(response);

    expect(text).toContain('Full LogicMonitor payload');
  });

  // 2. list (large >5 items) — compact table, no full JSON
  it('uses sampled compact output for large lists instead of rendering every row', () => {
    const result: OperationResult<unknown> = {
      success: true,
      items: makeDeviceItems(30),
      total: 30,
    };

    const response = buildToolResponse({ operation: 'list' }, result, deviceConfig);
    const text = textOf(response);
    const tableLines = text.split('\n').filter(line => line.startsWith('| '));

    expect(text).not.toContain('Full LogicMonitor payload');
    expect(text).toContain('Sampled rows');
    expect(text).toContain('30 total');
    expect(text).toContain('device-1');
    expect(text).toContain('device-30');
    expect(text).not.toContain('device-15');
    expect(tableLines).toHaveLength(9);
    expect(text).toContain('lm_session get');
  });

  // 3. list (large) has correct summary fields for device
  it('compact table includes configured summary fields for device', () => {
    const result: OperationResult<unknown> = {
      success: true,
      items: makeDeviceItems(30),
      total: 30,
    };

    const response = buildToolResponse({ operation: 'list' }, result, deviceConfig);
    const text = textOf(response);

    // Header row should have these columns
    expect(text).toContain('| id | displayName | hostStatus |');
  });

  // 4. get (single item) — full payload, internal fields stripped
  it('includes full payload for get and strips top-level raw/meta', () => {
    const result: OperationResult<unknown> = {
      success: true,
      data: { id: 1, name: 'test' },
      raw: 'top-raw',
      meta: 'top-meta',
    };

    const response = buildToolResponse({ operation: 'get' }, result, deviceConfig);
    const text = textOf(response);

    expect(text).toContain('Full LogicMonitor payload');
    // The data itself should be there
    expect(text).toContain('"id": 1');
    expect(text).toContain('"name": "test"');
    // Internal fields must NOT appear
    expect(text).not.toContain('"top-raw"');
    expect(text).not.toContain('"top-meta"');
  });

  // 5. get_data (large time-series) — summary stats + sampled rows
  it('formats large time-series data with stats and sampled rows', () => {
    const dataPoints = Array.from({ length: 100 }, (_, i) => ({
      timestampUTC: `2026-03-22T${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`,
      CPUBusyPercent: 10 + Math.sin(i / 10) * 40,
      MemUsage: 50 + Math.cos(i / 10) * 20,
    }));

    const result: OperationResult<unknown> = {
      success: true,
      data: {
        deviceId: 1,
        deviceName: 'test-server',
        datasourceName: 'CPU',
        datasourceId: 10,
        instanceName: 'total',
        instanceId: 5,
        dataPoints,
      },
    };

    const config = { resourceName: 'deviceData', resourceTitle: 'LogicMonitor device data' };
    const response = buildToolResponse({ operation: 'get_data' }, result, config);
    const text = textOf(response);

    // Should have summary statistics
    expect(text).toContain('Summary statistics');
    expect(text).toMatch(/Min/);
    expect(text).toMatch(/Max/);
    expect(text).toMatch(/Avg/);
    expect(text).toMatch(/Latest/);
    // Should have sampled data
    expect(text).toContain('Sampled data');
    // Should NOT contain all 100 data points — the full JSON would have 100 timestampUTC entries
    const timestampMatches = text.match(/2026-03-22T/g);
    expect(timestampMatches).not.toBeNull();
    expect(timestampMatches!.length).toBeLessThan(100);
    // Should contain session access hint
    expect(text).toContain('lm_session get');
  });

  // 6. batch (small <= 5 results) — full payload
  it('includes full payload for small batch (<=5 results)', () => {
    const result: OperationResult<unknown> = {
      success: true,
      summary: { total: 3, succeeded: 3, failed: 0 },
      results: [
        { index: 0, success: true, data: { id: 1 } },
        { index: 1, success: true, data: { id: 2 } },
        { index: 2, success: true, data: { id: 3 } },
      ],
    };

    const response = buildToolResponse({ operation: 'update' }, result, deviceConfig);
    const text = textOf(response);

    expect(text).toContain('Full LogicMonitor payload');
  });

  // 7. batch (large >5 results, all success) — compact, session hint
  it('uses compact view for large batch updates with only valid stored-session hints', () => {
    const results = Array.from({ length: 20 }, (_, i) => ({
      index: i,
      success: true,
      data: { id: i + 1, displayName: `device-${i + 1}` },
    }));

    const result: OperationResult<unknown> = {
      success: true,
      summary: { total: 20, succeeded: 20, failed: 0 },
      results,
    };

    const response = buildToolResponse({ operation: 'update' }, result, deviceConfig);
    const text = textOf(response);

    expect(text).not.toContain('Full LogicMonitor payload');
    expect(text).not.toContain('lastUpdatedDevices');
  });

  it('does not invent update-session hints for batch delete results that store no session key', () => {
    const result: OperationResult<unknown> = {
      success: true,
      summary: { total: 8, succeeded: 8, failed: 0 },
      results: Array.from({ length: 8 }, (_, i) => ({
        index: i,
        success: true,
        data: { id: i + 1 },
      })),
    };

    const response = buildToolResponse({ operation: 'delete' }, result, deviceConfig);
    const text = textOf(response);

    expect(text).not.toContain('lastUpdated');
    expect(text).not.toContain('lastDeletedDeviceId');
    expect(text).not.toContain('Full per-item results stored in session');
  });

  it('uses create-session hints only when a batch create result includes stored items', () => {
    const items = makeDeviceItems(8);
    const result: OperationResult<unknown> = {
      success: true,
      items,
      summary: { total: 8, succeeded: 8, failed: 0 },
      results: items.map((item, index) => ({
        index,
        success: true,
        data: item,
      })),
    };

    const response = buildToolResponse({ operation: 'create' }, result, deviceConfig);
    const text = textOf(response);

    expect(text).toContain('lastCreatedDevices');
    expect(text).not.toContain('lastUpdatedDevices');
  });

  // 8. batch (with failures) — failures shown in output
  it('shows failed items in batch output', () => {
    const results = Array.from({ length: 20 }, (_, i) => ({
      index: i,
      success: i < 18,
      data: { id: i + 1, displayName: `device-${i + 1}` },
      error: i >= 18 ? `Error updating device-${i + 1}` : undefined,
    }));

    const result: OperationResult<unknown> = {
      success: true,
      summary: { total: 20, succeeded: 18, failed: 2 },
      results,
    };

    const response = buildToolResponse({ operation: 'update' }, result, deviceConfig);
    const text = textOf(response);

    expect(text).toContain('Failed items');
    expect(text).toContain('| index | id | error |');
    expect(text).toContain('Error updating device-19');
    expect(text).toContain('Error updating device-20');
  });

  // 9. stripInternalFields — raw, meta, request removed from top and nested levels
  it('strips raw, meta, and request from both top-level and nested results', () => {
    const result: OperationResult<unknown> = {
      success: true,
      raw: { shouldNotAppear: true },
      meta: { shouldNotAppear: true },
      request: { shouldNotAppear: true },
      summary: { total: 2, succeeded: 2, failed: 0 },
      results: [
        { index: 0, success: true, data: { id: 1 }, raw: 'nested-raw', meta: 'nested-meta' },
        { index: 1, success: true, data: { id: 2 }, raw: 'nested-raw-2', meta: 'nested-meta-2' },
      ],
    };

    const response = buildToolResponse({ operation: 'update' }, result, deviceConfig);
    const text = textOf(response);

    expect(text).not.toContain('shouldNotAppear');
    expect(text).not.toContain('nested-raw');
    expect(text).not.toContain('nested-meta');
  });

  // 10. summary text always present
  it('always includes a summary text in the first content block', () => {
    // Test with a list result
    const listResult: OperationResult<unknown> = {
      success: true,
      items: makeDeviceItems(3),
      total: 3,
    };
    const listResponse = buildToolResponse({ operation: 'list' }, listResult, deviceConfig);
    expect(listResponse.content.length).toBeGreaterThanOrEqual(1);
    expect(listResponse.content[0].text).toContain('succeeded');

    // Test with a get result
    const getResult: OperationResult<unknown> = {
      success: true,
      data: { id: 1, name: 'test' },
    };
    const getResponse = buildToolResponse({ operation: 'get' }, getResult, deviceConfig);
    expect(getResponse.content.length).toBeGreaterThanOrEqual(1);
    expect(getResponse.content[0].text).toContain('succeeded');

    // Test with a batch result
    const batchResult: OperationResult<unknown> = {
      success: true,
      summary: { total: 3, succeeded: 3, failed: 0 },
      results: [
        { index: 0, success: true, data: { id: 1 } },
      ],
    };
    const batchResponse = buildToolResponse({ operation: 'update' }, batchResult, deviceConfig);
    expect(batchResponse.content.length).toBeGreaterThanOrEqual(1);
    expect(batchResponse.content[0].text).toContain('succeeded');
  });

  it('preserves summary text and adds a structured payload for lm_logs errors', () => {
    const response = buildToolErrorResponse(
      new LogicMonitorApiError('LogicMonitor API error: retained query failed', {
        code: 'LOG_QUERY_FAILED',
        status: 503,
        requestMethod: 'post',
        requestUrl: '/log/search',
        requestId: 'req-123',
      }),
      {
        resourceName: 'logs',
        resourceTitle: 'LogicMonitor logs',
        includeStructuredErrorPayload: true,
        errorRequestMetadata: {
          operation: 'search',
          portal: 'portal-a',
          query: 'severity:error',
          range: {
            startAtMs: 1000,
            endAtMs: 2000,
          },
        },
      }
    );

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('LogicMonitor API error (503): LogicMonitor API error: retained query failed');
    expect(response.content[1].text).toContain('"code": "LOG_QUERY_FAILED"');
    expect(response.content[1].text).toContain('"method": "post"');
    expect(response.content[1].text).toContain('"operation": "search"');
  });

  it('keeps config-style summaries for lm_logs precheck errors while preserving structured payloads', () => {
    const response = buildToolErrorResponse(
      new LogicMonitorUsageError(
        'lm_logs requires session-backed credentials. Configure LM_SESSION_LISTENER_BASE_URL and target a portal with the portal argument or lm_session defaultPortal.',
        { code: 'SESSION_REQUIRED' }
      ),
      {
        resourceName: 'logs',
        resourceTitle: 'LogicMonitor logs',
        includeStructuredErrorPayload: true,
        errorRequestMetadata: {
          operation: 'search',
          query: 'severity:error',
          range: {
            startAtMs: 1000,
            endAtMs: 2000,
          },
        },
      }
    );

    expect(response.content[0].text).toBe(
      'lm_logs requires session-backed credentials. Configure LM_SESSION_LISTENER_BASE_URL and target a portal with the portal argument or lm_session defaultPortal.'
    );
    expect(response.content[1].text).toContain('"code": "SESSION_REQUIRED"');
    expect(response.content[1].text).not.toContain('LogicMonitor API error');
  });
});
