/**
 * Test suite for lm_user tool
 */

import { createTestClient, TestMCPClient } from '../utils/testClient.js';
import {
  assertToolSuccess,
  extractToolData,
  isValidLMId,
} from '../utils/testHelpers.js';
import { generateUserPayload } from '../utils/fixtures.js';

describe('lm_user', () => {
  let client: TestMCPClient;
  let createdUserIds: number[] = [];
  let availableRoles: number[] = [];
  let canProvisionUsers = false;

  function shouldSkipUserMutationTests(): boolean {
    if (canProvisionUsers) {
      return false;
    }

    console.log('Skipping user mutation test - no reusable role IDs were discoverable from portal users.');
    return true;
  }

  beforeAll(async () => {
    client = await createTestClient('lm-user-test-session');

    const rolesResult = await client.callTool('lm_user', {
      operation: 'list',
      size: 100,
      autoPaginate: false,
      fields: 'id,roles',
    });

    if (rolesResult.success) {
      const rolesData = extractToolData<{
        items?: Array<{
          apionly?: boolean;
          roles?: Array<{ id?: number; name?: string }>;
        }>;
      }>(rolesResult);

      const preferredRoleIds = new Set<number>();
      const fallbackRoleIds = new Set<number>();
      const anyRoleIds = new Set<number>();

      for (const user of rolesData.items ?? []) {
        for (const role of user.roles ?? []) {
          if (typeof role.id !== 'number' || role.id <= 0) {
            continue;
          }

          anyRoleIds.add(role.id);

          const roleName = (role.name ?? '').toLowerCase();
          const isAdminRole = roleName.includes('admin');

          if (user.apionly && !isAdminRole) {
            preferredRoleIds.add(role.id);
          } else if (!isAdminRole) {
            fallbackRoleIds.add(role.id);
          }
        }
      }

      availableRoles = Array.from(
        preferredRoleIds.size > 0
          ? preferredRoleIds
          : fallbackRoleIds.size > 0
            ? fallbackRoleIds
            : anyRoleIds
      ).slice(0, 1);
      canProvisionUsers = availableRoles.length > 0;
    }

    console.log('Test environment:');
    console.log(`  - Available Roles: ${availableRoles.length}`);
  });

  afterAll(async () => {
    // Cleanup all created users
    if (createdUserIds.length > 0) {
      console.log(`Cleaning up ${createdUserIds.length} test user(s)...`);
      for (const id of createdUserIds) {
        try {
          await client.callTool('lm_user', {
            operation: 'delete',
            id,
          });
        } catch (error) {
          console.warn(`Failed to delete user ${id}:`, error);
        }
      }
    }
  });

  describe('List Operations', () => {
    test('should list users with default parameters', async () => {
      const result = await client.callTool('lm_user', {
        operation: 'list',
      });

      assertToolSuccess(result);
      const data = extractToolData<{ success: boolean; items: unknown[]; total: number }>(result);

      expect(data.success).toBe(true);
      expect(Array.isArray(data.items)).toBe(true);
      expect(typeof data.total).toBe('number');
      expect(data.total).toBeGreaterThan(0);
    });

    test('should list users with size limit', async () => {
      const result = await client.callTool('lm_user', {
        operation: 'list',
        size: 5,
        autoPaginate: false,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ items: unknown[] }>(result);

      expect(Array.isArray(data.items)).toBe(true);
      expect(data.items.length).toBeLessThanOrEqual(5);
    });

    test('should list users with field selection', async () => {
      const result = await client.callTool('lm_user', {
        operation: 'list',
        fields: 'id,username,email',
      });

      assertToolSuccess(result);
      const data = extractToolData<{ items: Array<{ id: number; username: string; email: string }> }>(result);

      if (data.items.length > 0) {
        const user = data.items[0];
        expect(user).toHaveProperty('id');
        expect(user).toHaveProperty('username');
        expect(user).toHaveProperty('email');
        expect(user).not.toHaveProperty('roles');
      }
    });
  });

  describe('Get Operations', () => {
    let testUserId: number;

    beforeAll(async () => {
      if (shouldSkipUserMutationTests()) {
        return;
      }

      // Create a user for get tests
      const payload = generateUserPayload({ roles: availableRoles });
      const createResult = await client.callTool('lm_user', {
        operation: 'create',
        ...payload,
      });
      
      assertToolSuccess(createResult);
      const createData = extractToolData<{ data: { id: number } }>(createResult);
      testUserId = createData.data.id;
      createdUserIds.push(testUserId);
    });

    test('should get user by ID with full fields', async () => {
      if (shouldSkipUserMutationTests()) {
        return;
      }

      const result = await client.callTool('lm_user', {
        operation: 'get',
        id: testUserId,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ success: boolean; data: { id: number; username: string } }>(result);

      expect(data.success).toBe(true);
      expect(data.data.id).toBe(testUserId);
      expect(data.data).toHaveProperty('username');
    });

    test('should get user with specific field selection', async () => {
      if (shouldSkipUserMutationTests()) {
        return;
      }

      const result = await client.callTool('lm_user', {
        operation: 'get',
        id: testUserId,
        fields: 'id,username,email,firstName,lastName',
      });

      assertToolSuccess(result);
      const data = extractToolData<{ data: { id: number; username: string; email: string } }>(result);

      expect(data.data).toHaveProperty('id');
      expect(data.data).toHaveProperty('username');
      expect(data.data).toHaveProperty('email');
      expect(data.data).toHaveProperty('firstName');
      expect(data.data).toHaveProperty('lastName');
      expect(data.data).not.toHaveProperty('roles');
    });
  });

  describe('Create Operations', () => {
    test('should create single user with required fields', async () => {
      if (shouldSkipUserMutationTests()) {
        return;
      }

      const payload = generateUserPayload({ roles: availableRoles });

      const result = await client.callTool('lm_user', {
        operation: 'create',
        ...payload,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ success: boolean; data: { id: number; username: string } }>(result);

      expect(data.success).toBe(true);
      expect(isValidLMId(data.data.id)).toBe(true);
      expect(data.data.username).toBe(payload.username);

      createdUserIds.push(data.data.id);
    });

    test('should create API-only user', async () => {
      if (shouldSkipUserMutationTests()) {
        return;
      }

      const payload = generateUserPayload({
        roles: availableRoles,
      });

      const result = await client.callTool('lm_user', {
        operation: 'create',
        ...payload,
        apionly: true,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ data: { id: number; apionly: boolean } }>(result);

      expect(isValidLMId(data.data.id)).toBe(true);
      createdUserIds.push(data.data.id);
    });

    test('should create batch of users', async () => {
      if (shouldSkipUserMutationTests()) {
        return;
      }

      const users = Array.from({ length: 3 }, (_, i) => 
        generateUserPayload({
          roles: availableRoles,
          username: `mcp-test-user-batch-${Date.now()}-${i}`,
        })
      );

      const result = await client.callTool('lm_user', {
        operation: 'create',
        users,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ 
        success: boolean; 
        items: Array<{ id: number; username: string }>;
        summary: { total: number; succeeded: number; failed: number };
      }>(result);

      expect(data.success).toBe(true);
      expect(data.items.length).toBe(3);
      expect(data.summary.succeeded).toBe(3);
      expect(data.summary.failed).toBe(0);

      data.items.forEach(user => createdUserIds.push(user.id));
    });

    test('should validate error handling for missing required fields', async () => {
      const result = await client.callTool('lm_user', {
        operation: 'create',
        username: 'invalid-user',
        // Missing: email, firstName, lastName, roles
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Update Operations', () => {
    let testUserId: number;

    beforeEach(async () => {
      if (shouldSkipUserMutationTests()) {
        return;
      }

      const payload = generateUserPayload({ roles: availableRoles });
      const createResult = await client.callTool('lm_user', {
        operation: 'create',
        ...payload,
      });
      
      assertToolSuccess(createResult);
      const createData = extractToolData<{ data: { id: number } }>(createResult);
      testUserId = createData.data.id;
      createdUserIds.push(testUserId);
    });

    test('should update single user', async () => {
      if (shouldSkipUserMutationTests()) {
        return;
      }

      const result = await client.callTool('lm_user', {
        operation: 'update',
        id: testUserId,
        note: 'Updated note',
        phone: '555-1234',
      });

      assertToolSuccess(result);
      const data = extractToolData<{ success: boolean; data: { id: number } }>(result);

      expect(data.success).toBe(true);
      expect(data.data.id).toBe(testUserId);
    });

    test('should batch update with explicit array of users', async () => {
      if (shouldSkipUserMutationTests()) {
        return;
      }

      const user2Payload = generateUserPayload({ roles: availableRoles });
      const user2Result = await client.callTool('lm_user', {
        operation: 'create',
        ...user2Payload,
      });
      assertToolSuccess(user2Result);
      const user2Data = extractToolData<{ data: { id: number } }>(user2Result);
      const user2Id = user2Data.data.id;
      createdUserIds.push(user2Id);

      const result = await client.callTool('lm_user', {
        operation: 'update',
        users: [
          { id: testUserId, note: 'Batch updated 1' },
          { id: user2Id, note: 'Batch updated 2' },
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
    test('should delete single user by ID', async () => {
      if (shouldSkipUserMutationTests()) {
        return;
      }

      const payload = generateUserPayload({ roles: availableRoles });
      const createResult = await client.callTool('lm_user', {
        operation: 'create',
        ...payload,
      });
      
      assertToolSuccess(createResult);
      const createData = extractToolData<{ data: { id: number } }>(createResult);
      const userId = createData.data.id;

      const result = await client.callTool('lm_user', {
        operation: 'delete',
        id: userId,
      });

      assertToolSuccess(result);
      const data = extractToolData<{ success: boolean }>(result);

      expect(data.success).toBe(true);

      // Verify deletion
      const getResult = await client.callTool('lm_user', {
        operation: 'get',
        id: userId,
      });

      expect(getResult.success).toBe(false);
    });

    test('should batch delete using explicit IDs', async () => {
      if (shouldSkipUserMutationTests()) {
        return;
      }

      const user1Payload = generateUserPayload({ roles: availableRoles });
      const user1Result = await client.callTool('lm_user', {
        operation: 'create',
        ...user1Payload,
      });
      assertToolSuccess(user1Result);
      const user1Data = extractToolData<{ data: { id: number } }>(user1Result);
      const user1Id = user1Data.data.id;

      const user2Payload = generateUserPayload({ roles: availableRoles });
      const user2Result = await client.callTool('lm_user', {
        operation: 'create',
        ...user2Payload,
      });
      assertToolSuccess(user2Result);
      const user2Data = extractToolData<{ data: { id: number } }>(user2Result);
      const user2Id = user2Data.data.id;

      const result = await client.callTool('lm_user', {
        operation: 'delete',
        ids: [user1Id, user2Id],
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
    test('should handle invalid user ID', async () => {
      const result = await client.callTool('lm_user', {
        operation: 'get',
        id: 999999999,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle invalid operation', async () => {
      const result = await client.callTool('lm_user', {
        operation: 'invalid_operation',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
