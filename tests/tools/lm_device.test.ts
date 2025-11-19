/**
 * Test suite for lm_device tool
 * Reference implementation for all tool tests
 */

import { createTestClient, TestMCPClient } from '../utils/testClient.js';
import {
  assertToolSuccess,
  extractToolData,
  isValidLMId,
} from '../utils/testHelpers.js';
import {
  discoverResources,
  createTestDevice,
  deleteDevice,
  deleteDevices,
  cleanupTestDevices,
  DiscoveredResources,
} from '../utils/resourceHelpers.js';
import { generateDevicePayload, generateDevicePayloads } from '../utils/fixtures.js';

describe('lm_device', () => {
  let client: TestMCPClient;
  let resources: DiscoveredResources;
  let createdDeviceIds: number[] = [];

  beforeAll(async () => {
    // Create test client
    client = await createTestClient('lm-device-test-session');
    
    // Discover portal resources
    resources = await discoverResources(client);
    
    // Verify we have required resources
    if (resources.collectors.length === 0) {
      throw new Error('No active collectors found in portal. Cannot run device tests.');
    }

    console.log('Test environment:');
    console.log(`  - Collectors: ${resources.collectors.length}`);
    console.log(`  - Device Groups: ${resources.deviceGroups.length}`);
    console.log(`  - Existing Devices: ${resources.devices.length}`);
  });

  afterAll(async () => {
    // Cleanup all created devices
    if (createdDeviceIds.length > 0) {
      console.log(`Cleaning up ${createdDeviceIds.length} test device(s)...`);
      await deleteDevices(client, createdDeviceIds);
    }

    // Additional cleanup: find any leftover test devices
    await cleanupTestDevices(client);
  });

  describe('List Operations', () => {
    test('should list devices with default parameters', async () => {
      const result = await client.callTool('lm_device', {
        operation: 'list',
      });

      assertToolSuccess(result);
      const data = extractToolData<{ success: boolean; items: unknown[]; total: number }>(result);

      expect(data.success).toBe(true);
      expect(Array.isArray(data.items)).toBe(true);
      expect(typeof data.total).toBe('number');
      expect(data.total).toBeGreaterThan(0);
    });

    test('should list devices with size limit', async () => {
      const result = await client.callTool('lm_device', {
        operation: 'list',
        size: 5,
        autoPaginate: false,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ items: unknown[] }>(result);

      expect(Array.isArray(data.items)).toBe(true);
      expect(data.items.length).toBeLessThanOrEqual(5);
    });

    test('should list devices with filter', async () => {
      // Use pre-existing devices with logicmonitor.com in displayName
      const result = await client.callTool('lm_device', {
        operation: 'list',
        filter: 'displayName:"*logicmonitor.com"',
      });

      assertToolSuccess(result);

      const data = extractToolData<{ items: Array<{ id: number; displayName: string }> }>(result);

      expect(data.items.length).toBeGreaterThan(0);
      // Verify at least one device has logicmonitor.com in the name
      expect(data.items.some(d => d.displayName.includes('logicmonitor.com'))).toBe(true);
    });

    test('should list devices with field selection', async () => {
      const result = await client.callTool('lm_device', {
        operation: 'list',
        fields: 'id,displayName,name',
      });

      assertToolSuccess(result);
      const data = extractToolData<{ items: Array<{ id: number; displayName: string; name: string }> }>(result);

      expect(data.items.length).toBeGreaterThan(0);
      
      const device = data.items[0];
      expect(device).toHaveProperty('id');
      expect(device).toHaveProperty('displayName');
      expect(device).toHaveProperty('name');
      expect(device).not.toHaveProperty('hostStatus');
    });

    test('should handle pagination with offset', async () => {
      const firstPage = await client.callTool('lm_device', {
        operation: 'list',
        size: 2,
        offset: 0,
      });

      assertToolSuccess(firstPage);
      const firstData = extractToolData<{ items: Array<{ id: number }> }>(firstPage);

      const secondPage = await client.callTool('lm_device', {
        operation: 'list',
        size: 2,
        offset: 2,
      });

      assertToolSuccess(secondPage);
      const secondData = extractToolData<{ items: Array<{ id: number }> }>(secondPage);

      // Verify different results
      if (firstData.items.length > 0 && secondData.items.length > 0) {
        expect(firstData.items[0].id).not.toBe(secondData.items[0].id);
      }
    });
  });

  describe('Get Operations', () => {
    let testDeviceId: number;

    beforeAll(async () => {
      // Create a device for get tests
      const device = await createTestDevice(client, {
        collectorId: resources.collectors[0].id,
      });
      testDeviceId = device.id;
      createdDeviceIds.push(testDeviceId);
    });

    test('should get device by ID with full fields', async () => {
      const result = await client.callTool('lm_device', {
        operation: 'get',
        id: testDeviceId,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ success: boolean; data: { id: number; displayName: string } }>(result);

      expect(data.success).toBe(true);
      expect(data.data.id).toBe(testDeviceId);
      expect(data.data).toHaveProperty('displayName');
    });

    test('should get device with specific field selection', async () => {
      const result = await client.callTool('lm_device', {
        operation: 'get',
        id: testDeviceId,
        fields: 'id,displayName,hostStatus',
      });

      assertToolSuccess(result);
      const data = extractToolData<{ data: { id: number; displayName: string; hostStatus: string } }>(result);

      expect(data.data).toHaveProperty('id');
      expect(data.data).toHaveProperty('displayName');
      expect(data.data).toHaveProperty('hostStatus');
    });

    test('should get device using ID from previous operation (session context)', async () => {
      // First, get the device to populate session
      await client.callTool('lm_device', {
        operation: 'get',
        id: testDeviceId,
      });

      // Now get again without specifying ID
      const result = await client.callTool('lm_device', {
        operation: 'get',
      });

      assertToolSuccess(result);
      const data = extractToolData<{ data: { id: number } }>(result);

      expect(data.data.id).toBe(testDeviceId);
    });
  });

  describe('Create Operations', () => {
    test('should create single device with required fields', async () => {
      const payload = generateDevicePayload({
        collectorId: resources.collectors[0].id,
      });

      const result = await client.callTool('lm_device', {
        operation: 'create',
        ...payload,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ success: boolean; data: { id: number; displayName: string } }>(result);

      expect(data.success).toBe(true);
      expect(isValidLMId(data.data.id)).toBe(true);
      expect(data.data.displayName).toBe(payload.displayName);

      // Track for cleanup
      createdDeviceIds.push(data.data.id);
    });

    test('should create device with custom properties', async () => {
      const customProps = [
        { name: 'test.property1', value: 'value1' },
        { name: 'test.property2', value: 'value2' },
      ];

      const payload = generateDevicePayload({
        collectorId: resources.collectors[0].id,
        customProperties: customProps,
      });

      const result = await client.callTool('lm_device', {
        operation: 'create',
        ...payload,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ data: { id: number } }>(result);

      expect(isValidLMId(data.data.id)).toBe(true);
      createdDeviceIds.push(data.data.id);
    });

    test('should create batch of devices', async () => {
      const devices = generateDevicePayloads(3, resources.collectors[0].id);

      const result = await client.callTool('lm_device', {
        operation: 'create',
        devices,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ 
        success: boolean; 
        items: Array<{ id: number; displayName: string }>;
        summary: { total: number; succeeded: number; failed: number };
      }>(result);

      expect(data.success).toBe(true);
      expect(data.items.length).toBe(3);
      expect(data.summary.succeeded).toBe(3);
      expect(data.summary.failed).toBe(0);

      // Track for cleanup
      data.items.forEach(device => createdDeviceIds.push(device.id));
    });

    test('should validate error handling for missing required fields', async () => {
      const result = await client.callTool('lm_device', {
        operation: 'create',
        displayName: 'Invalid Device',
        // Missing: name, preferredCollectorId
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Update Operations', () => {
    let testDeviceId: number;

    beforeEach(async () => {
      // Create a fresh device for each update test
      const device = await createTestDevice(client, {
        collectorId: resources.collectors[0].id,
      });
      testDeviceId = device.id;
      createdDeviceIds.push(testDeviceId);
    });

    test('should update single device', async () => {
      const result = await client.callTool('lm_device', {
        operation: 'update',
        id: testDeviceId,
        disableAlerting: false,
        customProperties: [
          { name: 'test.updated', value: 'true' },
        ],
      });

      assertToolSuccess(result);
      const data = extractToolData<{ success: boolean; data: { id: number } }>(result);

      expect(data.success).toBe(true);
      expect(data.data.id).toBe(testDeviceId);
    });

    test('should batch update with explicit array of devices', async () => {
      // Create two more devices
      const device2 = await createTestDevice(client, {
        collectorId: resources.collectors[0].id,
      });
      const device3 = await createTestDevice(client, {
        collectorId: resources.collectors[0].id,
      });
      createdDeviceIds.push(device2.id, device3.id);

      const result = await client.callTool('lm_device', {
        operation: 'update',
        devices: [
          { id: testDeviceId, disableAlerting: false },
          { id: device2.id, disableAlerting: false },
          { id: device3.id, disableAlerting: false },
        ],
      });

      assertToolSuccess(result);
      const data = extractToolData<{ 
        success: boolean;
        summary: { total: number; succeeded: number };
      }>(result);

      expect(data.success).toBe(true);
      expect(data.summary.total).toBe(3);
      expect(data.summary.succeeded).toBe(3);
    });

    test('should batch update using filter', async () => {
      // Use pre-existing devices with dead hostStatus (should have multiple)
      // First verify we have multiple devices matching the filter
      const listResult = await client.callTool('lm_device', {
        operation: 'list',
        filter: 'hostStatus:"dead*"',
        fields: 'id,displayName,hostStatus',
      });

      assertToolSuccess(listResult);
      const listData = extractToolData<{ items: Array<{ id: number; displayName: string }> }>(listResult);

      // Skip test if we don't have at least 2 dead devices
      if (listData.items.length < 2) {
        console.log('Skipping test - need at least 2 devices with dead hostStatus');
        return;
      }

      // Perform batch update on dead devices
      const result = await client.callTool('lm_device', {
        operation: 'update',
        filter: 'hostStatus:"dead*"',
        updates: {
          customProperties: [
            { name: 'test.batch.updated', value: 'true' },
          ],
        },
      });

      assertToolSuccess(result);
      const data = extractToolData<{ 
        success: boolean;
        summary: { total: number; succeeded: number; failed: number };
        results: Array<{ index: number; success: boolean; error?: string; data?: unknown }>;
      }>(result);

      // Log any failures for troubleshooting
      if (data.summary.failed > 0) {
        const failures = data.results.filter(r => !r.success);
        console.log('Batch update failures:', JSON.stringify(failures, null, 2));
      }

      // Batch operations can have partial failures - verify at least 2 succeeded
      expect(data.summary.succeeded).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Delete Operations', () => {
    test('should delete single device by ID', async () => {
      // Create a device to delete
      const device = await createTestDevice(client, {
        collectorId: resources.collectors[0].id,
      });

      const result = await client.callTool('lm_device', {
        operation: 'delete',
        id: device.id,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ success: boolean }>(result);

      expect(data.success).toBe(true);

      // Verify deletion by trying to get it
      const getResult = await client.callTool('lm_device', {
        operation: 'get',
        id: device.id,
      });

      expect(getResult.success).toBe(false);
    });

    test('should batch delete using explicit IDs', async () => {
      // Create devices to delete
      const device1 = await createTestDevice(client, {
        collectorId: resources.collectors[0].id,
      });
      const device2 = await createTestDevice(client, {
        collectorId: resources.collectors[0].id,
      });

      const result = await client.callTool('lm_device', {
        operation: 'delete',
        devices: [
          { id: device1.id },
          { id: device2.id },
        ],
      });

      assertToolSuccess(result);
      const data = extractToolData<{ 
        success: boolean;
        summary: { total: number; succeeded: number };
      }>(result);

      expect(data.success).toBe(true);
      expect(data.summary.total).toBe(2);
      expect(data.summary.succeeded).toBe(2);
    });

    test('should verify deletion', async () => {
      // Create and delete a device
      const device = await createTestDevice(client, {
        collectorId: resources.collectors[0].id,
      });

      await deleteDevice(client, device.id);

      // Verify it's gone
      const listResult = await client.callTool('lm_device', {
        operation: 'list',
        filter: `id:${device.id}`,
      });

      assertToolSuccess(listResult);
      const data = extractToolData<{ items: unknown[] }>(listResult);

      expect(data.items.length).toBe(0);
    });
  });

  describe('Session Context Integration', () => {
    test('should store last operation result in session', async () => {
      // Create a device
      const payload = generateDevicePayload({
        collectorId: resources.collectors[0].id,
      });

      await client.callTool('lm_device', {
        operation: 'create',
        ...payload,
      });

      // Check session context - verify device was stored in session variables
      const context = client.getSessionContext();
      expect(context.variables).toHaveProperty('lastCreatedDevice');
      expect(context.variables).toHaveProperty('lastDevice');
    });

    test('should use applyToPrevious for batch operations', async () => {
      // List pre-existing devices
      const listResult = await client.callTool('lm_device', {
        operation: 'list',
        filter: 'name:"192*"',
        fields: 'id,name,displayName',
      });

      assertToolSuccess(listResult);
      const listData = extractToolData<{ items: unknown[] }>(listResult);
      
      // Skip test if we don't have at least 2 matching devices
      if (listData.items.length < 2) {
        console.log('Skipping test - need at least 2 devices with name starting with 192.*');
        return;
      }

      // Update using applyToPrevious (applies to the lastDeviceList from the previous list operation)
      const result = await client.callTool('lm_device', {
        operation: 'update',
        applyToPrevious: 'lastDeviceList',
        updates: {
          customProperties: [
            { name: 'test.apply.previous', value: 'true' },
          ],
        },
      });

      assertToolSuccess(result);
      const data = extractToolData<{ 
        success: boolean;
        summary: { succeeded: number };
      }>(result);

      expect(data.success).toBe(true);
      expect(data.summary.succeeded).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid device ID', async () => {
      const result = await client.callTool('lm_device', {
        operation: 'get',
        id: 999999999,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle invalid operation', async () => {
      const result = await client.callTool('lm_device', {
        operation: 'invalid_operation',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle invalid field names', async () => {
      const result = await client.callTool('lm_device', {
        operation: 'list',
        fields: 'id,invalidFieldName,anotherInvalidField',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown device field');
    });
  });
});

