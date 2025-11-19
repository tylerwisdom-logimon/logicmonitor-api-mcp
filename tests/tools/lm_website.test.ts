/**
 * Test suite for lm_website tool
 */

import { createTestClient, TestMCPClient } from '../utils/testClient.js';
import {
  assertToolSuccess,
  extractToolData,
  isValidLMId,
} from '../utils/testHelpers.js';
import { generateWebsitePayload } from '../utils/fixtures.js';

describe('lm_website', () => {
  let client: TestMCPClient;
  let createdWebsiteIds: number[] = [];
  let testWebsiteGroupId: number;

  beforeAll(async () => {
    client = await createTestClient('lm-website-test-session');
    
    // Get the root website group ID (typically 1)
    const groupsResult = await client.callTool('lm_website_group', {
      operation: 'list',
      size: 1,
    });
    
    if (groupsResult.success) {
      const groupsData = extractToolData<{ items: Array<{ id: number }> }>(groupsResult);
      testWebsiteGroupId = groupsData.items[0]?.id || 1;
    } else {
      testWebsiteGroupId = 1;
    }

    console.log('Test environment:');
    console.log(`  - Website Group ID: ${testWebsiteGroupId}`);
  });

  afterAll(async () => {
    // Cleanup all created websites
    if (createdWebsiteIds.length > 0) {
      console.log(`Cleaning up ${createdWebsiteIds.length} test website(s)...`);
      for (const id of createdWebsiteIds) {
        try {
          await client.callTool('lm_website', {
            operation: 'delete',
            id,
          });
        } catch (error) {
          console.warn(`Failed to delete website ${id}:`, error);
        }
      }
    }
  });

  describe('List Operations', () => {
    test('should list websites with default parameters', async () => {
      const result = await client.callTool('lm_website', {
        operation: 'list',
      });

      assertToolSuccess(result);
      const data = extractToolData<{ success: boolean; items: unknown[]; total: number }>(result);

      expect(data.success).toBe(true);
      expect(Array.isArray(data.items)).toBe(true);
      expect(typeof data.total).toBe('number');
    });

    test('should list websites with size limit', async () => {
      const result = await client.callTool('lm_website', {
        operation: 'list',
        size: 5,
        autoPaginate: false,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ items: unknown[] }>(result);

      expect(Array.isArray(data.items)).toBe(true);
      expect(data.items.length).toBeLessThanOrEqual(5);
    });

    test('should list websites with field selection', async () => {
      const result = await client.callTool('lm_website', {
        operation: 'list',
        fields: 'id,name,domain,type',
      });

      assertToolSuccess(result);
      const data = extractToolData<{ items: Array<{ id: number; name: string; domain: string; type: string }> }>(result);

      if (data.items.length > 0) {
        const website = data.items[0];
        expect(website).toHaveProperty('id');
        expect(website).toHaveProperty('name');
        expect(website).toHaveProperty('domain');
        expect(website).toHaveProperty('type');
        expect(website).not.toHaveProperty('description');
      }
    });
  });

  describe('Get Operations', () => {
    let testWebsiteId: number;

    beforeAll(async () => {
      // Create a website for get tests
      const payload = generateWebsitePayload({ groupId: testWebsiteGroupId });
      const createResult = await client.callTool('lm_website', {
        operation: 'create',
        ...payload,
      });
      
      assertToolSuccess(createResult);
      const createData = extractToolData<{ data: { id: number } }>(createResult);
      testWebsiteId = createData.data.id;
      createdWebsiteIds.push(testWebsiteId);
    });

    test('should get website by ID with full fields', async () => {
      const result = await client.callTool('lm_website', {
        operation: 'get',
        id: testWebsiteId,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ success: boolean; data: { id: number; name: string } }>(result);

      expect(data.success).toBe(true);
      expect(data.data.id).toBe(testWebsiteId);
      expect(data.data).toHaveProperty('name');
    });

    test('should get website with specific field selection', async () => {
      const result = await client.callTool('lm_website', {
        operation: 'get',
        id: testWebsiteId,
        fields: 'id,name,domain',
      });

      assertToolSuccess(result);
      const data = extractToolData<{ data: { id: number; name: string; domain: string } }>(result);

      expect(data.data).toHaveProperty('id');
      expect(data.data).toHaveProperty('name');
      expect(data.data).toHaveProperty('domain');
      expect(data.data).not.toHaveProperty('type');
    });
  });

  describe('Create Operations', () => {
    test('should create single website with required fields', async () => {
      const payload = generateWebsitePayload({ groupId: testWebsiteGroupId });

      const result = await client.callTool('lm_website', {
        operation: 'create',
        ...payload,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ success: boolean; data: { id: number; name: string } }>(result);

      expect(data.success).toBe(true);
      expect(isValidLMId(data.data.id)).toBe(true);
      expect(data.data.name).toBe(payload.name);

      createdWebsiteIds.push(data.data.id);
    });

    test('should create website with custom properties', async () => {
      const customProps = [
        { name: 'test.property1', value: 'value1' },
        { name: 'test.property2', value: 'value2' },
      ];

      const payload = generateWebsitePayload({
        groupId: testWebsiteGroupId,
      });

      const result = await client.callTool('lm_website', {
        operation: 'create',
        ...payload,
        properties: customProps,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ data: { id: number } }>(result);

      expect(isValidLMId(data.data.id)).toBe(true);
      createdWebsiteIds.push(data.data.id);
    });

    test('should create batch of websites', async () => {
      const websites = Array.from({ length: 3 }, (_, i) => 
        generateWebsitePayload({
          groupId: testWebsiteGroupId,
          name: `mcp-test-website-batch-${Date.now()}-${i}`,
        })
      );

      const result = await client.callTool('lm_website', {
        operation: 'create',
        websites,
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

      data.items.forEach(website => createdWebsiteIds.push(website.id));
    });

    test('should validate error handling for missing required fields', async () => {
      const result = await client.callTool('lm_website', {
        operation: 'create',
        name: 'Invalid Website',
        // Missing: domain, type, groupId
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Update Operations', () => {
    let testWebsiteId: number;

    beforeEach(async () => {
      const payload = generateWebsitePayload({ groupId: testWebsiteGroupId });
      const createResult = await client.callTool('lm_website', {
        operation: 'create',
        ...payload,
      });
      
      assertToolSuccess(createResult);
      const createData = extractToolData<{ data: { id: number } }>(createResult);
      testWebsiteId = createData.data.id;
      createdWebsiteIds.push(testWebsiteId);
    });

    test('should update single website', async () => {
      const result = await client.callTool('lm_website', {
        operation: 'update',
        id: testWebsiteId,
        description: 'Updated description',
        properties: [
          { name: 'test.updated', value: 'true' },
        ],
      });

      assertToolSuccess(result);
      const data = extractToolData<{ success: boolean; data: { id: number } }>(result);

      expect(data.success).toBe(true);
      expect(data.data.id).toBe(testWebsiteId);
    });

    test('should batch update with explicit array of websites', async () => {
      const website2Payload = generateWebsitePayload({ groupId: testWebsiteGroupId });
      const website2Result = await client.callTool('lm_website', {
        operation: 'create',
        ...website2Payload,
      });
      assertToolSuccess(website2Result);
      const website2Data = extractToolData<{ data: { id: number } }>(website2Result);
      const website2Id = website2Data.data.id;
      createdWebsiteIds.push(website2Id);

      const result = await client.callTool('lm_website', {
        operation: 'update',
        websites: [
          { id: testWebsiteId, description: 'Batch updated 1' },
          { id: website2Id, description: 'Batch updated 2' },
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
    test('should delete single website by ID', async () => {
      const payload = generateWebsitePayload({ groupId: testWebsiteGroupId });
      const createResult = await client.callTool('lm_website', {
        operation: 'create',
        ...payload,
      });
      
      assertToolSuccess(createResult);
      const createData = extractToolData<{ data: { id: number } }>(createResult);
      const websiteId = createData.data.id;

      const result = await client.callTool('lm_website', {
        operation: 'delete',
        id: websiteId,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ success: boolean }>(result);

      expect(data.success).toBe(true);

      // Verify deletion
      const getResult = await client.callTool('lm_website', {
        operation: 'get',
        id: websiteId,
      });

      expect(getResult.success).toBe(false);
    });

    test('should batch delete using explicit IDs', async () => {
      const website1Payload = generateWebsitePayload({ groupId: testWebsiteGroupId });
      const website1Result = await client.callTool('lm_website', {
        operation: 'create',
        ...website1Payload,
      });
      assertToolSuccess(website1Result);
      const website1Data = extractToolData<{ data: { id: number } }>(website1Result);
      const website1Id = website1Data.data.id;

      const website2Payload = generateWebsitePayload({ groupId: testWebsiteGroupId });
      const website2Result = await client.callTool('lm_website', {
        operation: 'create',
        ...website2Payload,
      });
      assertToolSuccess(website2Result);
      const website2Data = extractToolData<{ data: { id: number } }>(website2Result);
      const website2Id = website2Data.data.id;

      const result = await client.callTool('lm_website', {
        operation: 'delete',
        websites: [
          { id: website1Id },
          { id: website2Id },
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
    test('should handle invalid website ID', async () => {
      const result = await client.callTool('lm_website', {
        operation: 'get',
        id: 999999999,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle invalid operation', async () => {
      const result = await client.callTool('lm_website', {
        operation: 'invalid_operation',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

