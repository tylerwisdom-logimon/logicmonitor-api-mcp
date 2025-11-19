/**
 * Resource discovery and cleanup utilities
 */

import { TestMCPClient } from './testClient.js';
import { assertToolSuccess, extractToolData, generateTestResourceName, retry } from './testHelpers.js';

export interface DiscoveredResources {
  collectors: Array<{ id: number; description: string }>;
  deviceGroups: Array<{ id: number; name: string; fullPath: string }>;
  devices: Array<{ id: number; displayName: string }>;
  rootDeviceGroupId: number;
}

/**
 * Discover existing resources in the portal
 */
export async function discoverResources(client: TestMCPClient): Promise<DiscoveredResources> {
  const resources: DiscoveredResources = {
    collectors: [],
    deviceGroups: [],
    devices: [],
    rootDeviceGroupId: 1,
  };

  // Discover collectors
  try {
    const collectorsResult = await client.callTool('lm_collector', {
      operation: 'list',
      size: 1000,
      filter: 'status:1',
    });
    
    assertToolSuccess(collectorsResult);
    const collectorsData = extractToolData<{ items: Array<{ id: number; description: string }> }>(collectorsResult);
    
    if (collectorsData.items && collectorsData.items.length > 0) {
      resources.collectors = collectorsData.items;
    }
  } catch (error) {
    console.warn('Failed to discover collectors:', error);
  }

  // Discover device groups - limit to top-level groups only to avoid pulling all groups
  try {
    const groupsResult = await client.callTool('lm_device_group', {
      operation: 'list',
      size: 50,
      filter: 'parentId:1', // Only get direct children of root group
      fields: 'id,name,fullPath,parentId',
    });
    
    assertToolSuccess(groupsResult);
    const groupsData = extractToolData<{ items: Array<{ id: number; name: string; fullPath: string }> }>(groupsResult);
    
    if (groupsData.items && groupsData.items.length > 0) {
      // Add root group explicitly
      resources.deviceGroups = [
        { id: 1, name: 'Root', fullPath: '/' },
        ...groupsData.items
      ];
      resources.rootDeviceGroupId = 1;
    } else {
      // Fallback: just use root group
      resources.deviceGroups = [{ id: 1, name: 'Root', fullPath: '/' }];
      resources.rootDeviceGroupId = 1;
    }
  } catch (error) {
    console.warn('Failed to discover device groups:', error);
    // Fallback: just use root group
    resources.deviceGroups = [{ id: 1, name: 'Root', fullPath: '/' }];
    resources.rootDeviceGroupId = 1;
  }

  // Discover existing devices (limit to 10)
  try {
    const devicesResult = await client.callTool('lm_device', {
      operation: 'list',
      size: 1000,
    });
    
    assertToolSuccess(devicesResult);
    const devicesData = extractToolData<{ items: Array<{ id: number; displayName: string }> }>(devicesResult);
    
    if (devicesData.items && devicesData.items.length > 0) {
      resources.devices = devicesData.items;
    }
  } catch (error) {
    console.warn('Failed to discover devices:', error);
  }

  return resources;
}

/**
 * Create a test device
 */
export async function createTestDevice(
  client: TestMCPClient,
  options: {
    collectorId: number;
    groupIds?: number[];
    displayName?: string;
    customProperties?: Array<{ name: string; value: string }>;
  }
): Promise<{ id: number; displayName: string }> {
  const displayName = options.displayName || generateTestResourceName('device');
  const name = `${displayName}.test.local`;

  const result = await client.callTool('lm_device', {
    operation: 'create',
    displayName,
    name,
    hostGroupIds: options.groupIds || [1],
    preferredCollectorId: options.collectorId,
    disableAlerting: true,
    customProperties: options.customProperties || [
      { name: 'test.resource', value: 'true' },
      { name: 'test.timestamp', value: Date.now().toString() },
    ],
  });

  assertToolSuccess(result);
  const data = extractToolData<{ data: { id: number; displayName: string } }>(result);
  
  return data.data;
}

/**
 * Delete a device by ID
 */
export async function deleteDevice(client: TestMCPClient, deviceId: number): Promise<void> {
  await retry(
    async () => {
      const result = await client.callTool('lm_device', {
        operation: 'delete',
        id: deviceId,
      });
      
      assertToolSuccess(result);
    },
    {
      maxAttempts: 3,
      delayMs: 1000,
      onRetry: (attempt, error) => {
        console.log(`Retry ${attempt} for deleting device ${deviceId}:`, error.message);
      },
    }
  );
}

/**
 * Delete multiple devices
 */
export async function deleteDevices(client: TestMCPClient, deviceIds: number[]): Promise<void> {
  if (deviceIds.length === 0) {
    return;
  }

  try {
    const result = await client.callTool('lm_device', {
      operation: 'delete',
      devices: deviceIds.map(id => ({ id })),
      batchOptions: {
        continueOnError: true,
        maxConcurrent: 3,
      },
    });

    // Don't throw on batch delete failures - just log
    if (!result.success) {
      console.warn('Batch delete had failures:', result.error);
    }
  } catch (error) {
    console.warn('Failed to batch delete devices:', error);
  }
}

/**
 * Find test devices by prefix
 */
export async function findTestDevices(
  client: TestMCPClient,
  prefix: string = global.testConfig.testResourcePrefix
): Promise<Array<{ id: number; displayName: string }>> {
  try {
    const result = await client.callTool('lm_device', {
      operation: 'list',
      filter: `displayName:"${prefix}*"`,
      size: 1000,
    });

    assertToolSuccess(result);
    const data = extractToolData<{ items: Array<{ id: number; displayName: string }> }>(result);
    
    return data.items || [];
  } catch (error) {
    console.warn('Failed to find test devices:', error);
    return [];
  }
}

/**
 * Cleanup all test devices
 */
export async function cleanupTestDevices(
  client: TestMCPClient,
  prefix: string = global.testConfig.testResourcePrefix
): Promise<void> {
  const testDevices = await findTestDevices(client, prefix);
  
  if (testDevices.length > 0) {
    console.log(`Cleaning up ${testDevices.length} test device(s)...`);
    const deviceIds = testDevices.map(d => d.id);
    await deleteDevices(client, deviceIds);
  }
}

/**
 * Create a test device group
 */
export async function createTestDeviceGroup(
  client: TestMCPClient,
  options: {
    name?: string;
    parentId?: number;
    description?: string;
  } = {}
): Promise<{ id: number; name: string }> {
  const name = options.name || generateTestResourceName('group');

  const result = await client.callTool('lm_device_group', {
    operation: 'create',
    name,
    parentId: options.parentId || 1,
    description: options.description || 'Test device group',
    customProperties: [
      { name: 'test.resource', value: 'true' },
    ],
  });

  assertToolSuccess(result);
  const data = extractToolData<{ data: { id: number; name: string } }>(result);
  
  return data.data;
}

/**
 * Delete a device group by ID
 */
export async function deleteDeviceGroup(
  client: TestMCPClient,
  groupId: number,
  deleteChildren: boolean = false
): Promise<void> {
  await retry(
    async () => {
      const result = await client.callTool('lm_device_group', {
        operation: 'delete',
        id: groupId,
        deleteChildren,
      });
      
      assertToolSuccess(result);
    },
    {
      maxAttempts: 3,
      delayMs: 1000,
    }
  );
}

/**
 * Find test device groups by prefix
 */
export async function findTestDeviceGroups(
  client: TestMCPClient,
  prefix: string = global.testConfig.testResourcePrefix
): Promise<Array<{ id: number; name: string }>> {
  try {
    const result = await client.callTool('lm_device_group', {
      operation: 'list',
      filter: `name:"${prefix}*"`,
      size: 1000,
    });

    assertToolSuccess(result);
    const data = extractToolData<{ items: Array<{ id: number; name: string }> }>(result);
    
    return data.items || [];
  } catch (error) {
    console.warn('Failed to find test device groups:', error);
    return [];
  }
}

/**
 * Cleanup all test device groups
 */
export async function cleanupTestDeviceGroups(
  client: TestMCPClient,
  prefix: string = global.testConfig.testResourcePrefix
): Promise<void> {
  const testGroups = await findTestDeviceGroups(client, prefix);
  
  if (testGroups.length > 0) {
    console.log(`Cleaning up ${testGroups.length} test device group(s)...`);
    
    for (const group of testGroups) {
      try {
        await deleteDeviceGroup(client, group.id, true);
      } catch (error) {
        console.warn(`Failed to delete group ${group.id}:`, error);
      }
    }
  }
}

