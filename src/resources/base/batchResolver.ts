/**
 * Batch Operation Resolver
 * Supports three patterns:
 * 1. Explicit arrays (devices: [{...}, {...}])
 * 2. Apply to previous results (applyToPrevious: "lastDeviceList")
 * 3. Filter-based batch (filter: "name:web*")
 */

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { SessionContext } from '../../session/sessionManager.js';
import { LogicMonitorClient } from '../../api/client.js';
import type { ResourceType, UpdateOperationArgs, DeleteOperationArgs, BatchOptions } from '../../types/operations.js';

export interface BatchResolutionResult<T> {
  items: T[];
  mode: 'explicit' | 'previous' | 'filter';
  source?: string;
  requiresConfirmation: boolean;
}

/** Maximum number of items allowed in a filter-based batch operation */
const MAX_FILTER_BATCH_SIZE = 5000;

export class BatchOperationResolver {
  /**
   * Resolve items for batch operation from various input patterns
   */
  static async resolveItems<T>(
    args: UpdateOperationArgs | DeleteOperationArgs,
    sessionContext: SessionContext,
    client: LogicMonitorClient,
    resourceType: ResourceType,
    itemsKey: string = 'items'
  ): Promise<BatchResolutionResult<T>> {
    // Pattern 1: Explicit array
    if (args[itemsKey] && Array.isArray(args[itemsKey])) {
      return {
        items: args[itemsKey] as T[],
        mode: 'explicit',
        requiresConfirmation: false
      };
    }

    // Pattern 2: Apply to previous results
    if (args.applyToPrevious) {
      const items = this.resolveFromSession<T>(args.applyToPrevious, sessionContext);
      return {
        items,
        mode: 'previous',
        source: args.applyToPrevious,
        requiresConfirmation: false
      };
    }

    // Pattern 3: Filter-based batch
    if (args.filter) {
      const items = await this.resolveFromFilter<T>(
        args.filter,
        client,
        resourceType
      );
      
      // Filter-based operations on destructive actions require confirmation
      const isDestructive = args.operation === 'delete';
      
      return {
        items,
        mode: 'filter',
        source: args.filter,
        requiresConfirmation: isDestructive && items.length > 10
      };
    }

    throw new McpError(
      ErrorCode.InvalidParams,
      `Batch operation requires one of: ${itemsKey} array, applyToPrevious reference, or filter`
    );
  }

  /**
   * Resolve items from session context
   */
  private static resolveFromSession<T>(
    reference: string,
    sessionContext: SessionContext
  ): T[] {
    const value = sessionContext.variables[reference];

    if (!value) {
      const available = Object.keys(sessionContext.variables);
      const availableStr = available.length > 0
        ? `Available variables: ${available.join(', ')}.`
        : 'No session variables are currently stored. Run a list operation first to populate session variables.';
      throw new McpError(
        ErrorCode.InvalidParams,
        `Session variable "${reference}" not found. ${availableStr} Use lm_session list to see all variables.`
      );
    }

    if (!Array.isArray(value)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Session variable '${reference}' is not an array`
      );
    }

    if (value.length === 0) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Session variable '${reference}' is empty`
      );
    }

    return value as T[];
  }

  /**
   * Resolve items by querying with filter
   */
  /** Map resource types to their list methods on the client */
  private static getListMethod(
    client: LogicMonitorClient,
    resourceType: ResourceType
  ): ((opts: { filter: string; size: number; autoPaginate: boolean }) => Promise<{ items: unknown[] }>) | null {
    const listMethods: Partial<Record<ResourceType, (opts: { filter: string; size: number; autoPaginate: boolean }) => Promise<{ items: unknown[] }>>> = {
      device: (opts) => client.listDevices(opts),
      deviceGroup: (opts) => client.listDeviceGroups(opts),
      website: (opts) => client.listWebsites(opts),
      websiteGroup: (opts) => client.listWebsiteGroups(opts),
      collector: (opts) => client.listCollectors(opts),
      alert: (opts) => client.listAlerts(opts),
      user: (opts) => client.listUsers(opts),
      dashboard: (opts) => client.listDashboards(opts),
      collectorGroup: (opts) => client.listCollectorGroups(opts),
    };
    return listMethods[resourceType] ?? null;
  }

  private static async resolveFromFilter<T>(
    filter: string,
    client: LogicMonitorClient,
    resourceType: ResourceType
  ): Promise<T[]> {
    const listMethod = this.getListMethod(client, resourceType);
    if (!listMethod) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Filter-based batch operations not supported for resource type: ${resourceType}`
      );
    }

    const result = await listMethod({ filter, size: 1000, autoPaginate: true });
    const items = result.items as T[];

    if (items.length === 0) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `No items found matching filter: ${filter}`
      );
    }

    if (items.length > MAX_FILTER_BATCH_SIZE) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Filter matched ${items.length} items, exceeding the safety limit of ${MAX_FILTER_BATCH_SIZE}. Narrow your filter to reduce the batch size.`
      );
    }

    return items;
  }

  /**
   * Extract batch options from args.
   * Accepts Record<string, unknown> so Zod-validated output can be passed directly.
   */
  static extractBatchOptions(args: Record<string, unknown>): BatchOptions {
    const batchOptions = args.batchOptions as Record<string, unknown> | undefined;
    return {
      maxConcurrent: (batchOptions?.maxConcurrent as number) ?? 5,
      continueOnError: (batchOptions?.continueOnError as boolean) ?? true,
      dryRun: (batchOptions?.dryRun as boolean) ?? false
    };
  }

  /**
   * Check if operation is a batch operation.
   * Accepts Record<string, unknown> so Zod-validated output can be passed directly.
   */
  static isBatchOperation(args: Record<string, unknown>, itemsKey: string = 'items'): boolean {
    return !!(
      (args[itemsKey] && Array.isArray(args[itemsKey]) && (args[itemsKey] as unknown[]).length >= 1) ||
      args.applyToPrevious ||
      args.filter
    );
  }

  /**
   * Validate batch operation safety
   */
  static validateBatchSafety(
    resolution: BatchResolutionResult<unknown>,
    operation: 'update' | 'delete',
    maxBatchSize: number = 1000
  ): void {
    if (resolution.items.length > maxBatchSize) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Batch operation exceeds maximum size of ${maxBatchSize} items (got ${resolution.items.length})`
      );
    }

    if (resolution.requiresConfirmation) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `This ${operation} operation affects ${resolution.items.length} items. For safety, please use explicit item arrays or applyToPrevious for destructive operations on large result sets.`
      );
    }
  }
}

