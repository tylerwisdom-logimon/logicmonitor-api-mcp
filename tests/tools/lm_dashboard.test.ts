/**
 * Test suite for lm_dashboard tool
 */

import { createTestClient, TestMCPClient } from '../utils/testClient.js';
import {
  assertToolSuccess,
  extractToolData,
  isValidLMId,
} from '../utils/testHelpers.js';
import { generateDashboardPayload } from '../utils/fixtures.js';

describe('lm_dashboard', () => {
  let client: TestMCPClient;
  let createdDashboardIds: number[] = [];
  let testDashboardGroupId: number;

  beforeAll(async () => {
    client = await createTestClient('lm-dashboard-test-session');
    
    // Get the root dashboard group ID (typically 1)
    const groupsResult = await client.callTool('lm_dashboard', {
      operation: 'list',
      size: 1,
    });
    
    if (groupsResult.success) {
      // Default to group ID 1
      testDashboardGroupId = 1;
    } else {
      testDashboardGroupId = 1;
    }

    console.log('Test environment:');
    console.log(`  - Dashboard Group ID: ${testDashboardGroupId}`);
  });

  afterAll(async () => {
    // Cleanup all created dashboards
    if (createdDashboardIds.length > 0) {
      console.log(`Cleaning up ${createdDashboardIds.length} test dashboard(s)...`);
      for (const id of createdDashboardIds) {
        try {
          await client.callTool('lm_dashboard', {
            operation: 'delete',
            id,
          });
        } catch (error) {
          console.warn(`Failed to delete dashboard ${id}:`, error);
        }
      }
    }
  });

  describe('List Operations', () => {
    test('should list dashboards with default parameters', async () => {
      const result = await client.callTool('lm_dashboard', {
        operation: 'list',
      });

      assertToolSuccess(result);
      const data = extractToolData<{ success: boolean; items: unknown[]; total: number }>(result);

      expect(data.success).toBe(true);
      expect(Array.isArray(data.items)).toBe(true);
      expect(typeof data.total).toBe('number');
    });

    test('should list dashboards with size limit', async () => {
      const result = await client.callTool('lm_dashboard', {
        operation: 'list',
        size: 5,
        autoPaginate: false,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ items: unknown[] }>(result);

      expect(Array.isArray(data.items)).toBe(true);
      expect(data.items.length).toBeLessThanOrEqual(5);
    });

    test('should list dashboards with field selection', async () => {
      const result = await client.callTool('lm_dashboard', {
        operation: 'list',
        fields: 'id,name,description,groupId',
      });

      assertToolSuccess(result);
      const data = extractToolData<{ items: Array<{ id: number; name: string }> }>(result);

      if (data.items.length > 0) {
        const dashboard = data.items[0];
        expect(dashboard).toHaveProperty('id');
        expect(dashboard).toHaveProperty('name');
        expect(dashboard).toHaveProperty('description');
        expect(dashboard).toHaveProperty('groupId');
        expect(dashboard).not.toHaveProperty('widgetsConfig');
      }
    });
  });

  describe('Get Operations', () => {
    let testDashboardId: number;

    beforeAll(async () => {
      // Create a dashboard for get tests
      const payload = generateDashboardPayload({ groupId: testDashboardGroupId });
      const createResult = await client.callTool('lm_dashboard', {
        operation: 'create',
        ...payload,
      });
      
      assertToolSuccess(createResult);
      const createData = extractToolData<{ data: { id: number } }>(createResult);
      testDashboardId = createData.data.id;
      createdDashboardIds.push(testDashboardId);
    });

    test('should get dashboard by ID with full fields', async () => {
      const result = await client.callTool('lm_dashboard', {
        operation: 'get',
        id: testDashboardId,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ success: boolean; data: { id: number; name: string } }>(result);

      expect(data.success).toBe(true);
      expect(data.data.id).toBe(testDashboardId);
      expect(data.data).toHaveProperty('name');
    });

    test('should get dashboard with specific field selection', async () => {
      const result = await client.callTool('lm_dashboard', {
        operation: 'get',
        id: testDashboardId,
        fields: 'id,name,description',
      });

      assertToolSuccess(result);
      const data = extractToolData<{ data: { id: number; name: string; description: string } }>(result);

      expect(data.data).toHaveProperty('id');
      expect(data.data).toHaveProperty('name');
      expect(data.data).toHaveProperty('description');
      expect(data.data).not.toHaveProperty('widgetsConfig');
    });
  });

  describe('Create Operations', () => {
    test('should create single dashboard with required fields', async () => {
      const payload = generateDashboardPayload({ groupId: testDashboardGroupId });

      const result = await client.callTool('lm_dashboard', {
        operation: 'create',
        ...payload,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ success: boolean; data: { id: number; name: string } }>(result);

      expect(data.success).toBe(true);
      expect(isValidLMId(data.data.id)).toBe(true);
      expect(data.data.name).toBe(payload.name);

      createdDashboardIds.push(data.data.id);
    });

    test('should create dashboard with widget tokens', async () => {
      const widgetTokens = [
        { name: 'defaultResourceGroup', value: '*' },
        { name: 'defaultDeviceGroup', value: '*' },
      ];

      const payload = generateDashboardPayload({ groupId: testDashboardGroupId });

      const result = await client.callTool('lm_dashboard', {
        operation: 'create',
        ...payload,
        widgetTokens,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ data: { id: number } }>(result);

      expect(isValidLMId(data.data.id)).toBe(true);
      createdDashboardIds.push(data.data.id);
    });

    test('should create batch of dashboards', async () => {
      const dashboards = Array.from({ length: 3 }, (_, i) => 
        generateDashboardPayload({
          groupId: testDashboardGroupId,
          name: `mcp-test-dashboard-batch-${Date.now()}-${i}`,
        })
      );

      const result = await client.callTool('lm_dashboard', {
        operation: 'create',
        dashboards,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ 
        success: boolean; 
        items: Array<{ id: number; name: string }>;
        summary: { total: number; succeeded: number; failed: number };
      }>(result);

      expect(data.success).toBe(true);
      expect(data.items.length).toBe(3);
      expect(data.summary.succeeded).toBe(3);
      expect(data.summary.failed).toBe(0);

      data.items.forEach(dashboard => createdDashboardIds.push(dashboard.id));
    });

    test('should validate error handling for missing required fields', async () => {
      const result = await client.callTool('lm_dashboard', {
        operation: 'create',
        name: 'Invalid Dashboard',
        // Missing: groupId
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Update Operations', () => {
    let testDashboardId: number;

    beforeEach(async () => {
      const payload = generateDashboardPayload({ groupId: testDashboardGroupId });
      const createResult = await client.callTool('lm_dashboard', {
        operation: 'create',
        ...payload,
      });
      
      assertToolSuccess(createResult);
      const createData = extractToolData<{ data: { id: number } }>(createResult);
      testDashboardId = createData.data.id;
      createdDashboardIds.push(testDashboardId);
    });

    test('should update single dashboard', async () => {
      const result = await client.callTool('lm_dashboard', {
        operation: 'update',
        id: testDashboardId,
        description: 'Updated description',
        widgetTokens: [
          { name: 'test.updated', value: 'true' },
        ],
      });

      assertToolSuccess(result);
      const data = extractToolData<{ success: boolean; data: { id: number } }>(result);

      expect(data.success).toBe(true);
      expect(data.data.id).toBe(testDashboardId);
    });

    test('should batch update with explicit array of dashboards', async () => {
      const dashboard2Payload = generateDashboardPayload({ groupId: testDashboardGroupId });
      const dashboard2Result = await client.callTool('lm_dashboard', {
        operation: 'create',
        ...dashboard2Payload,
      });
      assertToolSuccess(dashboard2Result);
      const dashboard2Data = extractToolData<{ data: { id: number } }>(dashboard2Result);
      const dashboard2Id = dashboard2Data.data.id;
      createdDashboardIds.push(dashboard2Id);

      const result = await client.callTool('lm_dashboard', {
        operation: 'update',
        dashboards: [
          { id: testDashboardId, description: 'Batch updated 1' },
          { id: dashboard2Id, description: 'Batch updated 2' },
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
  });

  describe('Delete Operations', () => {
    test('should delete single dashboard by ID', async () => {
      const payload = generateDashboardPayload({ groupId: testDashboardGroupId });
      const createResult = await client.callTool('lm_dashboard', {
        operation: 'create',
        ...payload,
      });
      
      assertToolSuccess(createResult);
      const createData = extractToolData<{ data: { id: number } }>(createResult);
      const dashboardId = createData.data.id;

      const result = await client.callTool('lm_dashboard', {
        operation: 'delete',
        id: dashboardId,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ success: boolean }>(result);

      expect(data.success).toBe(true);

      // Verify deletion
      const getResult = await client.callTool('lm_dashboard', {
        operation: 'get',
        id: dashboardId,
      });

      expect(getResult.success).toBe(false);
    });

    test('should batch delete using explicit IDs', async () => {
      const dashboard1Payload = generateDashboardPayload({ groupId: testDashboardGroupId });
      const dashboard1Result = await client.callTool('lm_dashboard', {
        operation: 'create',
        ...dashboard1Payload,
      });
      assertToolSuccess(dashboard1Result);
      const dashboard1Data = extractToolData<{ data: { id: number } }>(dashboard1Result);
      const dashboard1Id = dashboard1Data.data.id;

      const dashboard2Payload = generateDashboardPayload({ groupId: testDashboardGroupId });
      const dashboard2Result = await client.callTool('lm_dashboard', {
        operation: 'create',
        ...dashboard2Payload,
      });
      assertToolSuccess(dashboard2Result);
      const dashboard2Data = extractToolData<{ data: { id: number } }>(dashboard2Result);
      const dashboard2Id = dashboard2Data.data.id;

      const result = await client.callTool('lm_dashboard', {
        operation: 'delete',
        ids: [dashboard1Id, dashboard2Id],
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
  });

  describe('Error Handling', () => {
    test('should handle invalid dashboard ID', async () => {
      const result = await client.callTool('lm_dashboard', {
        operation: 'get',
        id: 999999999,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle invalid operation', async () => {
      const result = await client.callTool('lm_dashboard', {
        operation: 'invalid_operation',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

