/**
 * Unit tests for SessionHandler get-operation filtering (fields, index, limit).
 * Pure unit tests: no API calls, no credentials needed.
 */

import { SessionManager } from '../../../src/session/sessionManager.js';
import { SessionHandler } from '../../../src/resources/session/sessionHandler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SESSION_ID = 'test-session';

function makeDevices(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    displayName: `device-${i + 1}`,
    hostStatus: i % 2 === 0 ? 'alive' : 'dead',
    name: `device-${i + 1}.example.com`,
    preferredCollectorId: 100 + i,
  }));
}

function createHandlerWithData() {
  const sessionManager = new SessionManager();
  sessionManager.setVariable(SESSION_ID, 'lastDeviceList', makeDevices(10));
  const handler = new SessionHandler(sessionManager, SESSION_ID);
  return { handler, sessionManager };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionHandler get filtering', () => {
  // 1. No filters (backward compat) — returns full array
  it('returns full array when no filters are specified', async () => {
    const { handler } = createHandlerWithData();
    const result = await handler.handleOperation({
      operation: 'get',
      key: 'lastDeviceList',
    });

    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.found).toBe(true);
    const value = data.value as Array<Record<string, unknown>>;
    expect(value).toHaveLength(10);
    // Each item should have all 5 fields
    expect(Object.keys(value[0])).toEqual(
      expect.arrayContaining(['id', 'displayName', 'hostStatus', 'name', 'preferredCollectorId'])
    );
  });

  // 2. fields projection — only selected fields
  it('projects only the requested fields', async () => {
    const { handler } = createHandlerWithData();
    const result = await handler.handleOperation({
      operation: 'get',
      key: 'lastDeviceList',
      fields: 'id,displayName',
    });

    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    const value = data.value as Array<Record<string, unknown>>;
    expect(value).toHaveLength(10);
    for (const item of value) {
      expect(Object.keys(item).sort()).toEqual(['displayName', 'id']);
    }
  });

  // 3. index selection — returns a single item
  it('returns a single item when index is specified', async () => {
    const { handler } = createHandlerWithData();
    const result = await handler.handleOperation({
      operation: 'get',
      key: 'lastDeviceList',
      index: 2,
    });

    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    const value = data.value as Record<string, unknown>;
    // index 2 => the 3rd device (id=3)
    expect(value.id).toBe(3);
    expect(value.displayName).toBe('device-3');
    // Should be a single object, not an array
    expect(Array.isArray(data.value)).toBe(false);
  });

  // 4. index out of bounds — returns null
  it('returns null for out-of-bounds index', async () => {
    const { handler } = createHandlerWithData();
    const result = await handler.handleOperation({
      operation: 'get',
      key: 'lastDeviceList',
      index: 99,
    });

    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.value).toBeNull();
  });

  // 5. limit slicing — returns first N items
  it('returns first N items when limit is specified', async () => {
    const { handler } = createHandlerWithData();
    const result = await handler.handleOperation({
      operation: 'get',
      key: 'lastDeviceList',
      limit: 3,
    });

    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    const value = data.value as Array<Record<string, unknown>>;
    expect(value).toHaveLength(3);
    expect(value[0].id).toBe(1);
    expect(value[2].id).toBe(3);
  });

  // 6. limit > array length — returns full array
  it('returns full array when limit exceeds array length', async () => {
    const { handler } = createHandlerWithData();
    const result = await handler.handleOperation({
      operation: 'get',
      key: 'lastDeviceList',
      limit: 100,
    });

    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    const value = data.value as Array<Record<string, unknown>>;
    expect(value).toHaveLength(10);
  });

  // 7. fields + limit combo
  it('applies both fields projection and limit', async () => {
    const { handler } = createHandlerWithData();
    const result = await handler.handleOperation({
      operation: 'get',
      key: 'lastDeviceList',
      fields: 'id,hostStatus',
      limit: 2,
    });

    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    const value = data.value as Array<Record<string, unknown>>;
    expect(value).toHaveLength(2);
    for (const item of value) {
      expect(Object.keys(item).sort()).toEqual(['hostStatus', 'id']);
    }
  });

  // 8. fields on non-array value — ignored
  it('ignores fields parameter for non-array values', async () => {
    const sessionManager = new SessionManager();
    sessionManager.setVariable(SESSION_ID, 'simpleString', 'hello world');
    const handler = new SessionHandler(sessionManager, SESSION_ID);

    const result = await handler.handleOperation({
      operation: 'get',
      key: 'simpleString',
      fields: 'id',
    });

    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.value).toBe('hello world');
  });

  // 9. non-existent key — returns found: false
  it('returns found: false for non-existent key', async () => {
    const { handler } = createHandlerWithData();
    const result = await handler.handleOperation({
      operation: 'get',
      key: 'doesNotExist',
    });

    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.found).toBe(false);
  });
});
