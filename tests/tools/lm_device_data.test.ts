/**
 * Test suite for lm_device_data tool
 * Device metrics and datasource operations
 */

import { createTestClient, TestMCPClient } from '../utils/testClient.js';
import { assertToolSuccess, extractToolData } from '../utils/testHelpers.js';
import { discoverResources, DiscoveredResources } from '../utils/resourceHelpers.js';

describe('lm_device_data', () => {
  let client: TestMCPClient;
  let resources: DiscoveredResources;
  let testDeviceId: number | undefined;
  let testDatasourceId: number | undefined;
  let testInstanceId: number | undefined;

  beforeAll(async () => {
    client = await createTestClient('lm-device-data-test-session');
    resources = await discoverResources(client);

    // Find a device with datasources for testing
    if (resources.devices.length > 0) {
      testDeviceId = resources.devices[0].id;

      // Try to find datasources for this device
      const datasourcesResult = await client.callTool('lm_device_data', {
        operation: 'list_datasources',
        deviceId: testDeviceId,
        filter: 'dataSourceName:"HostStatus"',
      });

      if (datasourcesResult.success) {
        const dsData = extractToolData<{ items: Array<{ id: number; dataSourceId: number }> }>(datasourcesResult);
        if (dsData.items.length > 0) {
          testDatasourceId = dsData.items[0].id ;

          // Try to find instances for this datasource
          const instancesResult = await client.callTool('lm_device_data', {
            operation: 'list_instances',
            deviceId: testDeviceId,
            datasourceId: testDatasourceId,
          });

          if (instancesResult.success) {
            const instData = extractToolData<{ items: Array<{ id: number }> }>(instancesResult);
            if (instData.items.length > 0) {
              testInstanceId = instData.items[0].id;
            }
          }
        }
      }
    }

    console.log('Test environment:');
    console.log(`  - Test Device ID: ${testDeviceId || 'none'}`);
    console.log(`  - Test Datasource ID: ${testDatasourceId || 'none'}`);
    console.log(`  - Test Instance ID: ${testInstanceId || 'none'}`);
  });

  describe('List Datasources Operations', () => {
    test('should list datasources for a device', async () => {
      if (!testDeviceId) {
        console.log('Skipping test - no devices found');
        return;
      }

      const result = await client.callTool('lm_device_data', {
        operation: 'list_datasources',
        deviceId: testDeviceId,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ success: boolean; items: unknown[]; total: number }>(result);

      expect(data.success).toBe(true);
      expect(Array.isArray(data.items)).toBe(true);
    });

    test('should list datasources with size limit', async () => {
      if (!testDeviceId) {
        console.log('Skipping test - no devices found');
        return;
      }

      const result = await client.callTool('lm_device_data', {
        operation: 'list_datasources',
        deviceId: testDeviceId,
        size: 5,
        autoPaginate: false,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ items: unknown[] }>(result);

      expect(Array.isArray(data.items)).toBe(true);
      expect(data.items.length).toBeLessThanOrEqual(5);
    });

    test('should list datasources with include filter', async () => {
      if (!testDeviceId) {
        console.log('Skipping test - no devices found');
        return;
      }

      const result = await client.callTool('lm_device_data', {
        operation: 'list_datasources',
        deviceId: testDeviceId,
        datasourceIncludeFilter: '*',
      });

      assertToolSuccess(result);
      const data = extractToolData<{ items: unknown[] }>(result);

      expect(Array.isArray(data.items)).toBe(true);
    });

    test('should list datasources with exclude filter', async () => {
      if (!testDeviceId) {
        console.log('Skipping test - no devices found');
        return;
      }

      const result = await client.callTool('lm_device_data', {
        operation: 'list_datasources',
        deviceId: testDeviceId,
        datasourceExcludeFilter: 'NonExistent*',
      });

      assertToolSuccess(result);
      const data = extractToolData<{ items: unknown[] }>(result);

      expect(Array.isArray(data.items)).toBe(true);
    });
  });

  describe('List Instances Operations', () => {
    test('should list instances for a datasource', async () => {
      if (!testDeviceId || !testDatasourceId) {
        console.log('Skipping test - no device/datasource found');
        return;
      }

      const result = await client.callTool('lm_device_data', {
        operation: 'list_instances',
        deviceId: testDeviceId,
        datasourceId: testDatasourceId,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ success: boolean; items: unknown[]; total: number }>(result);

      expect(data.success).toBe(true);
      expect(Array.isArray(data.items)).toBe(true);
    });

    test('should list instances with size limit', async () => {
      if (!testDeviceId || !testDatasourceId) {
        console.log('Skipping test - no device/datasource found');
        return;
      }

      const result = await client.callTool('lm_device_data', {
        operation: 'list_instances',
        deviceId: testDeviceId,
        datasourceId: testDatasourceId,
        size: 5,
        autoPaginate: false,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ items: unknown[] }>(result);

      expect(Array.isArray(data.items)).toBe(true);
      expect(data.items.length).toBeLessThanOrEqual(5);
    });

    test('should list instances with field selection', async () => {
      if (!testDeviceId || !testDatasourceId) {
        console.log('Skipping test - no device/datasource found');
        return;
      }

      const result = await client.callTool('lm_device_data', {
        operation: 'list_instances',
        deviceId: testDeviceId,
        datasourceId: testDatasourceId,
        fields: 'id,name',
      });

      assertToolSuccess(result);
      const data = extractToolData<{ items: Array<{ id: number; name: string }> }>(result);

      if (data.items.length > 0) {
        expect(data.items[0]).toHaveProperty('id');
        expect(data.items[0]).toHaveProperty('name');
        expect(data.items[0]).not.toHaveProperty('displayName');
      }
    });
  });

  describe('Get Data Operations', () => {
    test('should get metric data for an instance', async () => {
      if (!testDeviceId || !testDatasourceId || !testInstanceId) {
        console.log('Skipping test - no device/datasource/instance found');
        return;
      }

      const result = await client.callTool('lm_device_data', {
        operation: 'get_data',
        deviceId: testDeviceId,
        datasourceId: testDatasourceId,
        instanceId: testInstanceId,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ 
        success: boolean;
        data: {
          deviceId: number;
          datasourceId: number;
          instanceId: number;
          dataPoints: Array<{ timestampEpoch: number; timestampUTC: string }>;
        };
      }>(result);

      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('deviceId');
      expect(data.data).toHaveProperty('datasourceId');
      expect(data.data).toHaveProperty('instanceId');
      expect(Array.isArray(data.data.dataPoints)).toBe(true);
    });

    test('should get metric data with time range', async () => {
      if (!testDeviceId || !testDatasourceId || !testInstanceId) {
        console.log('Skipping test - no device/datasource/instance found');
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      const oneDayAgo = now - (24 * 60 * 60);

      const result = await client.callTool('lm_device_data', {
        operation: 'get_data',
        deviceId: testDeviceId,
        datasourceId: testDatasourceId,
        instanceId: testInstanceId,
        start: oneDayAgo,
        end: now,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ 
        data: {
          dataPoints: Array<{ timestampEpoch: number }>;
        };
      }>(result);

      expect(Array.isArray(data.data.dataPoints)).toBe(true);
    });

    test('should get metric data with ISO date strings', async () => {
      if (!testDeviceId || !testDatasourceId || !testInstanceId) {
        console.log('Skipping test - no device/datasource/instance found');
        return;
      }

      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

      const result = await client.callTool('lm_device_data', {
        operation: 'get_data',
        deviceId: testDeviceId,
        datasourceId: testDatasourceId,
        instanceId: testInstanceId,
        startDate: oneDayAgo.toISOString(),
        endDate: now.toISOString(),
      });

      assertToolSuccess(result);
      const data = extractToolData<{ 
        data: {
          dataPoints: unknown[];
        };
      }>(result);

      expect(Array.isArray(data.data.dataPoints)).toBe(true);
    });

    test('should get metric data for multiple instances (batch)', async () => {
      if (!testDeviceId || !testDatasourceId) {
        console.log('Skipping test - no device/datasource found');
        return;
      }

      // Get multiple instances
      const instancesResult = await client.callTool('lm_device_data', {
        operation: 'list_instances',
        deviceId: testDeviceId,
        datasourceId: testDatasourceId,
      });

      if (!instancesResult.success) {
        console.log('Skipping batch test - could not list instances');
        return;
      }

      const instancesData = extractToolData<{ items: Array<{ id: number }> }>(instancesResult);
      
      if (instancesData.items.length < 2) {
        console.log('Skipping batch test - need at least 2 instances');
        return;
      }

      const instanceIds = instancesData.items.map(i => i.id);

      const result = await client.callTool('lm_device_data', {
        operation: 'get_data',
        deviceId: testDeviceId,
        datasourceId: testDatasourceId,
        instanceIds: instanceIds,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ 
        success: boolean;
        items: unknown[];
        summary: { total: number; succeeded: number };
      }>(result);

      expect(data.success).toBe(true);
      expect(Array.isArray(data.items)).toBe(true);
      expect(data.summary.total).toBe(instanceIds.length);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid device ID', async () => {
      const result = await client.callTool('lm_device_data', {
        operation: 'list_datasources',
        deviceId: 999999999,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle invalid datasource ID', async () => {
      if (!testDeviceId) {
        console.log('Skipping test - no devices found');
        return;
      }

      const result = await client.callTool('lm_device_data', {
        operation: 'list_instances',
        deviceId: testDeviceId,
        datasourceId: 999999999,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle missing required parameters', async () => {
      const result = await client.callTool('lm_device_data', {
        operation: 'get_data',
        // Missing: deviceId, datasourceId, instanceId
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle invalid operation', async () => {
      const result = await client.callTool('lm_device_data', {
        operation: 'invalid_operation',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

