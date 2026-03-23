/**
 * Device Group Resource Handler
 */

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ResourceHandler } from '../base/resourceHandler.js';
import { BatchOperationResolver } from '../base/batchResolver.js';
import { LogicMonitorClient } from '../../api/client.js';
import { SessionManager } from '../../session/sessionManager.js';
import { throwBatchFailure } from '../../utils/batchUtils.js';
import type { LMDeviceGroup } from '../../types/logicmonitor.js';
import type {
  ListOperationArgs,
  GetOperationArgs,
  CreateOperationArgs,
  UpdateOperationArgs,
  DeleteOperationArgs,
  OperationResult
} from '../../types/operations.js';
import {
  validateListDeviceGroups,
  validateGetDeviceGroup,
  validateCreateDeviceGroup,
  validateUpdateDeviceGroup,
  validateDeleteDeviceGroup
} from './deviceGroupZodSchemas.js';

export class DeviceGroupHandler extends ResourceHandler<LMDeviceGroup> {
  constructor(
    client: LogicMonitorClient,
    sessionManager: SessionManager,
    sessionId?: string
  ) {
    super(
      {
        resourceType: 'deviceGroup',
        resourceName: 'deviceGroup',
        idField: 'id',
        pluralKey: 'groups'
      },
      client,
      sessionManager,
      sessionId
    );
  }

  protected async handleList(args: ListOperationArgs): Promise<OperationResult<LMDeviceGroup>> {
    const validated = validateListDeviceGroups(args);
    const { fields, filter, size, offset, autoPaginate } = validated;
    const fieldConfig = this.validateFields(fields);

    const apiResult = await this.client.listDeviceGroups({
      fields: fieldConfig.fieldsParam,
      filter,
      size,
      offset,
      autoPaginate
    });

    const result: OperationResult<LMDeviceGroup> = {
      success: true,
      total: apiResult.total,
      items: apiResult.items as LMDeviceGroup[],
      request: {
        filter,
        size,
        offset,
        fields: fieldConfig.includeAll ? undefined : fieldConfig.applied.join(',')
      },
      meta: apiResult.meta,
      raw: apiResult.raw
    };

    this.recordAndStore('list', result);

    return result;
  }

  protected async handleGet(args: GetOperationArgs): Promise<OperationResult<LMDeviceGroup>> {
    const validated = validateGetDeviceGroup(args);
    const groupId = validated.id ?? this.resolveId(validated);

    if (typeof groupId !== 'number') {
      throw new McpError(ErrorCode.InvalidParams, 'Device group ID must be a number');
    }

    const { fields } = validated;
    const fieldConfig = this.validateFields(fields);

    const apiResult = await this.client.getDeviceGroup(groupId, {
      fields: fieldConfig.fieldsParam
    });

    const result: OperationResult<LMDeviceGroup> = {
      success: true,
      data: apiResult.data,
      request: {
        groupId,
        fields: fieldConfig.includeAll ? undefined : fieldConfig.applied.join(',')
      },
      meta: apiResult.meta,
      raw: apiResult.raw
    };

    this.recordAndStore('get', result);
    this.sessionManager.cacheResource(this.sessionContext.id, 'deviceGroup', groupId, apiResult.data);

    return result;
  }

  protected async handleCreate(args: CreateOperationArgs): Promise<OperationResult<LMDeviceGroup>> {
    const validated = validateCreateDeviceGroup(args);
    const validatedRecord = validated as Record<string, unknown>;
    const isBatch = this.isBatchCreate(validatedRecord);
    const batchOptions = BatchOperationResolver.extractBatchOptions(validatedRecord);
    const groupsInput = this.normalizeCreateInput(validatedRecord);

    const batchResult = await this.processBatch(
      groupsInput,
      async (group: Record<string, unknown>) => this.client.createDeviceGroup(group as Parameters<LogicMonitorClient['createDeviceGroup']>[0]),
      {
        maxConcurrent: batchOptions.maxConcurrent || 5,
        continueOnError: batchOptions.continueOnError ?? true,
        retryOnRateLimit: true
      }
    );

    if (!isBatch) {
      const entry = batchResult.results[0];
      if (!entry || !entry.success || !entry.data) {
        throwBatchFailure('Device group create', entry);
      }

      const result: OperationResult<LMDeviceGroup> = {
        success: true,
        data: entry.data as LMDeviceGroup,
        raw: entry.raw,
        meta: entry.meta
      };

      this.recordAndStore('create', result);

      return result;
    }

    const successful = batchResult.results.filter(r => r.success && r.data);

    const result: OperationResult<LMDeviceGroup> = {
      success: batchResult.success,
      items: successful.map(r => r.data as LMDeviceGroup),
      summary: batchResult.summary,
      results: batchResult.results
    };

    this.recordAndStore('create', result);

    return result;
  }

  protected async handleUpdate(args: UpdateOperationArgs): Promise<OperationResult<LMDeviceGroup>> {
    const validated = validateUpdateDeviceGroup(args);

    if (BatchOperationResolver.isBatchOperation(validated, 'groups')) {
      return this.handleBatchUpdate(validated);
    }

    const groupId = validated.id ?? this.resolveId(validated);
    if (typeof groupId !== 'number') {
      throw new McpError(ErrorCode.InvalidParams, 'Device group ID must be a number');
    }

    const { id: _id, operation: _operation, groups: _groups, applyToPrevious: _applyToPrevious, filter: _filter, batchOptions: _batchOptions, ...updates } = validated;
    const apiResult = await this.client.updateDeviceGroup(groupId, updates);

    const result: OperationResult<LMDeviceGroup> = {
      success: true,
      data: apiResult.data,
      raw: apiResult.raw,
      meta: apiResult.meta
    };

    this.recordAndStore('update', result);

    return result;
  }

  protected async handleDelete(args: DeleteOperationArgs): Promise<OperationResult<LMDeviceGroup>> {
    const validated = validateDeleteDeviceGroup(args);

    if (BatchOperationResolver.isBatchOperation(validated, 'groups')) {
      return this.handleBatchDelete(validated);
    }

    const groupId = validated.id ?? this.resolveId(validated);
    if (typeof groupId !== 'number') {
      throw new McpError(ErrorCode.InvalidParams, 'Device group ID must be a number');
    }

    const deleteChildren = (validated as Record<string, unknown>).deleteChildren as boolean ?? false;
    const apiResult = await this.client.deleteDeviceGroup(groupId, {
      deleteChildren
    });

    const result: OperationResult<LMDeviceGroup> = {
      success: true,
      data: { groupId, deleteChildren } as unknown as LMDeviceGroup,
      raw: apiResult.raw,
      meta: apiResult.meta
    };

    this.recordAndStore('delete', result);

    return result;
  }

  private async handleBatchUpdate(args: UpdateOperationArgs): Promise<OperationResult<LMDeviceGroup>> {
    const batchOptions = BatchOperationResolver.extractBatchOptions(args);
    const resolution = await BatchOperationResolver.resolveItems<Record<string, unknown>>(
      args,
      this.sessionContext,
      this.client,
      'deviceGroup',
      'groups'
    );

    BatchOperationResolver.validateBatchSafety(resolution, 'update');

    const globalUpdates = (args.updates || {}) as Record<string, unknown>;
    const updateOps = resolution.items.map(item => ({
      groupId: (item.id || item.groupId) as number,
      updates: { ...item, ...globalUpdates }
    }));

    const batchResult = await this.processBatch(
      updateOps,
      async ({ groupId, updates }) => this.client.updateDeviceGroup(groupId, updates),
      {
        maxConcurrent: batchOptions.maxConcurrent || 5,
        continueOnError: batchOptions.continueOnError ?? true,
        retryOnRateLimit: true
      }
    );

    const result: OperationResult<LMDeviceGroup> = {
      success: batchResult.success,
      items: batchResult.results.filter(r => r.success && r.data).map(r => r.data as LMDeviceGroup),
      summary: batchResult.summary,
      results: batchResult.results
    };

    this.recordAndStore('update', result);

    return result;
  }

  private async handleBatchDelete(args: DeleteOperationArgs): Promise<OperationResult<LMDeviceGroup>> {
    const batchOptions = BatchOperationResolver.extractBatchOptions(args);
    const resolution = await BatchOperationResolver.resolveItems<Record<string, unknown>>(
      args,
      this.sessionContext,
      this.client,
      'deviceGroup',
      'groups'
    );

    BatchOperationResolver.validateBatchSafety(resolution, 'delete');

    const deleteOps = resolution.items.map(item => ({
      groupId: (item.id || item.groupId) as number,
      deleteChildren: (args as Record<string, unknown>).deleteChildren as boolean ?? false
    }));

    const batchResult = await this.processBatch(
      deleteOps,
      async ({ groupId, deleteChildren }) => this.client.deleteDeviceGroup(groupId, { deleteChildren }),
      {
        maxConcurrent: batchOptions.maxConcurrent || 5,
        continueOnError: batchOptions.continueOnError ?? true,
        retryOnRateLimit: true
      }
    );

    const result: OperationResult<LMDeviceGroup> = {
      success: batchResult.success,
      summary: batchResult.summary,
      results: batchResult.results as OperationResult<LMDeviceGroup>['results']
    };

    this.recordAndStore('delete', result);

    return result;
  }
}
