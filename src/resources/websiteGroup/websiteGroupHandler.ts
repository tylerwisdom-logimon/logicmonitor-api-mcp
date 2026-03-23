/**
 * Website Group Resource Handler
 */

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ResourceHandler } from '../base/resourceHandler.js';
import { BatchOperationResolver } from '../base/batchResolver.js';
import { LogicMonitorClient } from '../../api/client.js';
import { SessionManager } from '../../session/sessionManager.js';
import { throwBatchFailure } from '../../utils/batchUtils.js';
import type { LMWebsiteGroup } from '../../types/logicmonitor.js';
import type {
  ListOperationArgs,
  GetOperationArgs,
  CreateOperationArgs,
  UpdateOperationArgs,
  DeleteOperationArgs,
  OperationResult
} from '../../types/operations.js';
import {
  validateListWebsiteGroups,
  validateGetWebsiteGroup,
  validateCreateWebsiteGroup,
  validateUpdateWebsiteGroup,
  validateDeleteWebsiteGroup
} from './websiteGroupZodSchemas.js';

export class WebsiteGroupHandler extends ResourceHandler<LMWebsiteGroup> {
  constructor(client: LogicMonitorClient, sessionManager: SessionManager, sessionId?: string) {
    super(
      { resourceType: 'websiteGroup', resourceName: 'websiteGroup', idField: 'id', pluralKey: 'groups' },
      client,
      sessionManager,
      sessionId
    );
  }

  protected async handleList(args: ListOperationArgs): Promise<OperationResult<LMWebsiteGroup>> {
    const validated = validateListWebsiteGroups(args);
    const { fields, filter, size, offset, autoPaginate } = validated;
    const fieldConfig = this.validateFields(fields);

    const apiResult = await this.client.listWebsiteGroups({
      fields: fieldConfig.fieldsParam,
      filter,
      size,
      offset,
      autoPaginate
    });

    const result: OperationResult<LMWebsiteGroup> = {
      success: true,
      total: apiResult.total,
      items: apiResult.items as LMWebsiteGroup[],
      meta: apiResult.meta,
      raw: apiResult.raw
    };

    this.recordAndStore('list', result);
    return result;
  }

  protected async handleGet(args: GetOperationArgs): Promise<OperationResult<LMWebsiteGroup>> {
    const validated = validateGetWebsiteGroup(args);
    const groupId = validated.id ?? this.resolveId(validated);

    if (typeof groupId !== 'number') {
      throw new McpError(ErrorCode.InvalidParams, 'Website group ID must be a number');
    }

    const { fields } = validated;
    const fieldConfig = this.validateFields(fields);

    const apiResult = await this.client.getWebsiteGroup(groupId, {
      fields: fieldConfig.fieldsParam
    });

    const result: OperationResult<LMWebsiteGroup> = {
      success: true,
      data: apiResult.data,
      meta: apiResult.meta,
      raw: apiResult.raw
    };

    this.recordAndStore('get', result);
    this.sessionManager.cacheResource(this.sessionContext.id, 'websiteGroup', groupId, apiResult.data);
    return result;
  }

  protected async handleCreate(args: CreateOperationArgs): Promise<OperationResult<LMWebsiteGroup>> {
    const validated = validateCreateWebsiteGroup(args);
    const validatedRecord = validated as Record<string, unknown>;
    const isBatch = this.isBatchCreate(validatedRecord);
    const batchOptions = BatchOperationResolver.extractBatchOptions(validatedRecord);
    const groupsInput = this.normalizeCreateInput(validatedRecord);

    const batchResult = await this.processBatch(
      groupsInput,
      async (group: Record<string, unknown>) => this.client.createWebsiteGroup(group as Parameters<LogicMonitorClient['createWebsiteGroup']>[0]),
      {
        maxConcurrent: batchOptions.maxConcurrent || 5,
        continueOnError: batchOptions.continueOnError ?? true,
        retryOnRateLimit: true
      }
    );

    if (!isBatch) {
      const entry = batchResult.results[0];
      if (!entry || !entry.success || !entry.data) {
        throwBatchFailure('Website group create', entry);
      }

      const result: OperationResult<LMWebsiteGroup> = {
        success: true,
        data: entry.data as LMWebsiteGroup,
        raw: entry.raw,
        meta: entry.meta
      };

      this.recordAndStore('create', result);
      return result;
    }

    const successful = batchResult.results.filter(r => r.success && r.data);
    const result: OperationResult<LMWebsiteGroup> = {
      success: batchResult.success,
      items: successful.map(r => r.data as LMWebsiteGroup),
      summary: batchResult.summary,
      results: batchResult.results
    };

    this.recordAndStore('create', result);
    return result;
  }

  protected async handleUpdate(args: UpdateOperationArgs): Promise<OperationResult<LMWebsiteGroup>> {
    const validated = validateUpdateWebsiteGroup(args);

    if (BatchOperationResolver.isBatchOperation(validated, 'groups')) {
      return this.handleBatchUpdate(validated);
    }

    const groupId = validated.id ?? this.resolveId(validated);
    if (typeof groupId !== 'number') {
      throw new McpError(ErrorCode.InvalidParams, 'Website group ID must be a number');
    }

    const { id: _id, operation: _operation, updates: _updateData, applyToPrevious: _applyToPrevious, filter: _filter, batchOptions: _batchOptions, ...rest } = validated as Record<string, unknown>;
    const apiResult = await this.client.updateWebsiteGroup(groupId, rest);

    const result: OperationResult<LMWebsiteGroup> = {
      success: true,
      data: apiResult.data,
      raw: apiResult.raw,
      meta: apiResult.meta
    };

    this.recordAndStore('update', result);
    return result;
  }

  protected async handleDelete(args: DeleteOperationArgs): Promise<OperationResult<LMWebsiteGroup>> {
    const validated = validateDeleteWebsiteGroup(args);

    if (BatchOperationResolver.isBatchOperation(validated, 'groups')) {
      return this.handleBatchDelete(validated);
    }

    const groupId = validated.id ?? this.resolveId(validated);
    if (typeof groupId !== 'number') {
      throw new McpError(ErrorCode.InvalidParams, 'Website group ID must be a number');
    }

    const validatedRecord = validated as Record<string, unknown>;
    const deleteParams: { deleteChildren?: boolean } = {};
    if (validatedRecord.deleteChildren !== undefined) {
      deleteParams.deleteChildren = validatedRecord.deleteChildren as boolean;
    }

    const apiResult = await this.client.deleteWebsiteGroup(groupId, deleteParams);

    const result: OperationResult<LMWebsiteGroup> = {
      success: true,
      data: { groupId } as unknown as LMWebsiteGroup,
      raw: apiResult.raw,
      meta: apiResult.meta
    };

    this.recordAndStore('delete', result);
    return result;
  }

  private async handleBatchUpdate(args: UpdateOperationArgs): Promise<OperationResult<LMWebsiteGroup>> {
    const batchOptions = BatchOperationResolver.extractBatchOptions(args);
    const resolution = await BatchOperationResolver.resolveItems<Record<string, unknown>>(
      args,
      this.sessionContext,
      this.client,
      'websiteGroup',
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
      async ({ groupId, updates }) => this.client.updateWebsiteGroup(groupId, updates),
      {
        maxConcurrent: batchOptions.maxConcurrent || 5,
        continueOnError: batchOptions.continueOnError ?? true,
        retryOnRateLimit: true
      }
    );

    const result: OperationResult<LMWebsiteGroup> = {
      success: batchResult.success,
      items: batchResult.results.filter(r => r.success && r.data).map(r => r.data as LMWebsiteGroup),
      summary: batchResult.summary,
      results: batchResult.results
    };

    this.recordAndStore('update', result);
    return result;
  }

  private async handleBatchDelete(args: DeleteOperationArgs): Promise<OperationResult<LMWebsiteGroup>> {
    const batchOptions = BatchOperationResolver.extractBatchOptions(args);
    const resolution = await BatchOperationResolver.resolveItems<Record<string, unknown>>(
      args,
      this.sessionContext,
      this.client,
      'websiteGroup',
      'groups'
    );

    BatchOperationResolver.validateBatchSafety(resolution, 'delete');

    const deleteOps = resolution.items.map(item => ({
      groupId: (item.id || item.groupId) as number,
      deleteChildren: (args.deleteChildren as boolean) ?? false
    }));

    const batchResult = await this.processBatch(
      deleteOps,
      async ({ groupId, deleteChildren }) => this.client.deleteWebsiteGroup(groupId, { deleteChildren }),
      {
        maxConcurrent: batchOptions.maxConcurrent || 5,
        continueOnError: batchOptions.continueOnError ?? true,
        retryOnRateLimit: true
      }
    );

    const result: OperationResult<LMWebsiteGroup> = {
      success: batchResult.success,
      summary: batchResult.summary,
      results: batchResult.results as OperationResult<LMWebsiteGroup>['results']
    };

    this.recordAndStore('delete', result);
    return result;
  }
}
