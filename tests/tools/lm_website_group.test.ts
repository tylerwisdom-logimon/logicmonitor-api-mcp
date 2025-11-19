/**
 * Test suite for lm_website_group tool
 */

import { createTestClient, TestMCPClient } from '../utils/testClient.js';
import {
  assertToolSuccess,
  waitForIndexing,
  extractToolData,
  isValidLMId,
} from '../utils/testHelpers.js';
import { generateWebsiteGroupPayload } from '../utils/fixtures.js';

describe('lm_website_group', () => {
  let client: TestMCPClient;
  let createdGroupIds: number[] = [];
  let rootGroupId: number;

  beforeAll(async () => {
    client = await createTestClient('lm-website-group-test-session');
    
    // Get root group (typically 1)
    const groupsResult = await client.callTool('lm_website_group', {
      operation: 'list',
      size: 1,
    });
    
    if (groupsResult.success) {
      const groupsData = extractToolData<{ items: Array<{ id: number }> }>(groupsResult);
      rootGroupId = groupsData.items[0]?.id || 1;
    } else {
      rootGroupId = 1;
    }

    console.log('Test environment:');
    console.log(`  - Root Group ID: ${rootGroupId}`);
  });

  afterAll(async () => {
    // Cleanup all created groups (in reverse order to handle parent-child relationships)
    if (createdGroupIds.length > 0) {
      console.log(`Cleaning up ${createdGroupIds.length} test website group(s)...`);
      for (const id of createdGroupIds.reverse()) {
        try {
          await client.callTool('lm_website_group', {
            operation: 'delete',
            id,
            deleteChildren: true,
          });
        } catch (error) {
          console.warn(`Failed to delete website group ${id}:`, error);
        }
      }
    }
  });

  describe('List Operations', () => {
    test('should list website groups with default parameters', async () => {
      const result = await client.callTool('lm_website_group', {
        operation: 'list',
      });

      assertToolSuccess(result);
      const data = extractToolData<{ success: boolean; items: unknown[]; total: number }>(result);

      expect(data.success).toBe(true);
      expect(Array.isArray(data.items)).toBe(true);
      expect(typeof data.total).toBe('number');
    });

    test('should list website groups with size limit', async () => {
      const result = await client.callTool('lm_website_group', {
        operation: 'list',
        size: 5,
        autoPaginate: false,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ items: unknown[] }>(result);

      expect(Array.isArray(data.items)).toBe(true);
      expect(data.items.length).toBeLessThanOrEqual(5);
    });

    test('should list website groups with field selection', async () => {
      const result = await client.callTool('lm_website_group', {
        operation: 'list',
        fields: 'id,name,description',
      });

      assertToolSuccess(result);
      const data = extractToolData<{ items: Array<{ id: number; name: string }> }>(result);

      if (data.items.length > 0) {
        const group = data.items[0];
        expect(group).toHaveProperty('id');
        expect(group).toHaveProperty('name');
        expect(group).toHaveProperty('description');
        expect(group).not.toHaveProperty('disableAlerting');
      }
    });
  });

  describe('Get Operations', () => {
    let testGroupId: number;

    beforeAll(async () => {
      const payload = generateWebsiteGroupPayload({ parentId: rootGroupId });
      const createResult = await client.callTool('lm_website_group', {
        operation: 'create',
        ...payload,
      });
      
      assertToolSuccess(createResult);
      const createData = extractToolData<{ data: { id: number } }>(createResult);
      testGroupId = createData.data.id;
      createdGroupIds.push(testGroupId);
    });

    test('should get website group by ID with full fields', async () => {
      const result = await client.callTool('lm_website_group', {
        operation: 'get',
        id: testGroupId,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ success: boolean; data: { id: number; name: string } }>(result);

      expect(data.success).toBe(true);
      expect(data.data.id).toBe(testGroupId);
      expect(data.data).toHaveProperty('name');
    });

    test('should get website group with specific field selection', async () => {
      const result = await client.callTool('lm_website_group', {
        operation: 'get',
        id: testGroupId,
        fields: 'id,name,parentId',
      });

      assertToolSuccess(result);
      const data = extractToolData<{ data: { id: number; name: string; parentId: number } }>(result);

      expect(data.data).toHaveProperty('id');
      expect(data.data).toHaveProperty('name');
      expect(data.data).toHaveProperty('parentId');
      expect(data.data).not.toHaveProperty('description');
    });
  });

  describe('Create Operations', () => {
    test('should create single website group with required fields', async () => {
      const payload = generateWebsiteGroupPayload({ parentId: rootGroupId });

      const result = await client.callTool('lm_website_group', {
        operation: 'create',
        ...payload,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ success: boolean; data: { id: number; name: string } }>(result);

      expect(data.success).toBe(true);
      expect(isValidLMId(data.data.id)).toBe(true);
      expect(data.data.name).toBe(payload.name);

      createdGroupIds.push(data.data.id);
    });

    test('should create website group with custom properties', async () => {
      const customProps = [
        { name: 'test.property1', value: 'value1' },
        { name: 'test.property2', value: 'value2' },
      ];

      const payload = generateWebsiteGroupPayload({ parentId: rootGroupId });

      const result = await client.callTool('lm_website_group', {
        operation: 'create',
        ...payload,
        properties: customProps,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ data: { id: number } }>(result);

      expect(isValidLMId(data.data.id)).toBe(true);
      createdGroupIds.push(data.data.id);
    });

    test('should create batch of website groups', async () => {
      const groups = Array.from({ length: 3 }, (_, i) => 
        generateWebsiteGroupPayload({
          parentId: rootGroupId,
          name: `mcp-test-ws-group-batch-${Date.now()}-${i}`,
        })
      );

      const result = await client.callTool('lm_website_group', {
        operation: 'create',
        groups,
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

      data.items.forEach(group => createdGroupIds.push(group.id));
    });

    test('should validate error handling for missing required fields', async () => {
      const result = await client.callTool('lm_website_group', {
        operation: 'create',
        name: 'Invalid Group',
        // Missing: parentId
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Update Operations', () => {
    let testGroupId: number;

    beforeEach(async () => {
      const payload = generateWebsiteGroupPayload({ parentId: rootGroupId });
      const createResult = await client.callTool('lm_website_group', {
        operation: 'create',
        ...payload,
      });
      
      assertToolSuccess(createResult);
      const createData = extractToolData<{ data: { id: number } }>(createResult);
      testGroupId = createData.data.id;
      createdGroupIds.push(testGroupId);
    });

    test('should update single website group', async () => {
      const result = await client.callTool('lm_website_group', {
        operation: 'update',
        id: testGroupId,
        description: 'Updated description',
        properties: [
          { name: 'test.updated', value: 'true' },
        ],
      });

      assertToolSuccess(result);
      const data = extractToolData<{ success: boolean; data: { id: number } }>(result);

      expect(data.success).toBe(true);
      expect(data.data.id).toBe(testGroupId);
    });

    test('should batch update with explicit array of groups', async () => {
      const group2Payload = generateWebsiteGroupPayload({ parentId: rootGroupId });
      const group2Result = await client.callTool('lm_website_group', {
        operation: 'create',
        ...group2Payload,
      });
      assertToolSuccess(group2Result);
      const group2Data = extractToolData<{ data: { id: number } }>(group2Result);
      const group2Id = group2Data.data.id;
      createdGroupIds.push(group2Id);

      const result = await client.callTool('lm_website_group', {
        operation: 'update',
        groups: [
          { id: testGroupId, description: 'Batch updated 1' },
          { id: group2Id, description: 'Batch updated 2' },
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
    test('should delete single website group by ID', async () => {
      const payload = generateWebsiteGroupPayload({ parentId: rootGroupId });
      const createResult = await client.callTool('lm_website_group', {
        operation: 'create',
        ...payload,
      });
      
      assertToolSuccess(createResult);
      const createData = extractToolData<{ data: { id: number } }>(createResult);
      const groupId = createData.data.id;

      await waitForIndexing();

      const result = await client.callTool('lm_website_group', {
        operation: 'delete',
        id: groupId,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ success: boolean }>(result);

      expect(data.success).toBe(true);

      // Verify deletion
      const getResult = await client.callTool('lm_website_group', {
        operation: 'get',
        id: groupId,
      });

      expect(getResult.success).toBe(false);
    });

    test('should batch delete using explicit IDs', async () => {
      const group1Payload = generateWebsiteGroupPayload({ parentId: rootGroupId });
      const group1Result = await client.callTool('lm_website_group', {
        operation: 'create',
        ...group1Payload,
      });
      assertToolSuccess(group1Result);
      const group1Data = extractToolData<{ data: { id: number } }>(group1Result);
      const group1Id = group1Data.data.id;

      const group2Payload = generateWebsiteGroupPayload({ parentId: rootGroupId });
      const group2Result = await client.callTool('lm_website_group', {
        operation: 'create',
        ...group2Payload,
      });
      assertToolSuccess(group2Result);
      const group2Data = extractToolData<{ data: { id: number } }>(group2Result);
      const group2Id = group2Data.data.id;

      await waitForIndexing();

      const result = await client.callTool('lm_website_group', {
        operation: 'delete',
        groups: [
          { id: group1Id },
          { id: group2Id },
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

  describe('Error Handling', () => {
    test('should handle invalid website group ID', async () => {
      const result = await client.callTool('lm_website_group', {
        operation: 'get',
        id: 999999999,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle invalid operation', async () => {
      const result = await client.callTool('lm_website_group', {
        operation: 'invalid_operation',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

