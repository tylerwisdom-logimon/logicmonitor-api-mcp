/**
 * Device Data Resource Handler
 * Handles device datasources, instances, and metric data operations
 */

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/**
 * Parse a time value into epoch seconds.
 * Supports: epoch numbers, ISO date strings, relative strings ("-6h", "-24h", "-7d", "-30m"), and "now".
 */
function parseTimeValue(value: string | number | undefined, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'number') return value;

  // Relative time strings: "-6h", "-24h", "-7d", "-30m"
  const relativeMatch = value.match(/^-(\d+)(m|h|d)$/);
  if (relativeMatch) {
    const amount = globalThis.parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2];
    const now = Math.floor(Date.now() / 1000);
    const multipliers: Record<string, number> = { m: 60, h: 3600, d: 86400 };
    return now - (amount * (multipliers[unit] || 3600));
  }

  // "now"
  if (value.toLowerCase() === 'now') {
    return Math.floor(Date.now() / 1000);
  }

  // ISO date string or other parseable date
  const parsed = new Date(value).getTime();
  if (!isNaN(parsed)) {
    return Math.floor(parsed / 1000);
  }

  return fallback;
}
import { ResourceHandler } from '../base/resourceHandler.js';
import { LogicMonitorClient } from '../../api/client.js';
import { SessionManager } from '../../session/sessionManager.js';
import type {
  LMDeviceDatasource,
  LMDeviceDatasourceInstance,
  LMDeviceData,
  LMDeviceDataFormatted
} from '../../types/logicmonitor.js';
import type { OperationResult, OperationType } from '../../types/operations.js';
import type { BatchResult } from '../../utils/batchProcessor.js';
import {
  validateListDatasources,
  validateListInstances,
  validateGetData
} from './deviceDataZodSchemas.js';

type DeviceDataType = LMDeviceDatasource | LMDeviceDatasourceInstance | LMDeviceDataFormatted;

export class DeviceDataHandler extends ResourceHandler<DeviceDataType> {
  constructor(
    client: LogicMonitorClient,
    sessionManager: SessionManager,
    sessionId?: string
  ) {
    super(
      {
        resourceType: 'deviceData',
        resourceName: 'deviceData',
        idField: 'id'
      },
      client,
      sessionManager,
      sessionId
    );
  }

  /**
   * Convert a wildcard pattern (with * and ?) to a regex string,
   * escaping all other regex special characters first.
   */
  private wildcardToRegex(pattern: string): string {
    return pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape regex specials (except * and ?)
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
  }

  protected override async handleCustomOperation(
    operation: string,
    args: unknown
  ): Promise<OperationResult<DeviceDataType> | null> {
    switch (operation) {
      case 'list_datasources':
        return this.handleListDatasources(args);
      case 'list_instances':
        return this.handleListInstances(args);
      case 'get_data':
        return this.handleGetData(args);
      default:
        return null;
    }
  }

  /**
   * List datasources for a device
   */
  private async handleListDatasources(args: unknown): Promise<OperationResult<LMDeviceDatasource>> {
    const validated = validateListDatasources(args);
    const { deviceId, filter, size, offset, autoPaginate, fields, datasourceIncludeFilter, datasourceExcludeFilter } = validated;

    const apiResult = await this.client.listDeviceDatasources(deviceId, {
      filter,
      size,
      offset,
      autoPaginate,
      fields
    });

    let items = apiResult.items;

    // Apply datasource name filters if provided
    if (datasourceIncludeFilter) {
      const includePattern = new RegExp(
        '^' + this.wildcardToRegex(datasourceIncludeFilter) + '$',
        'i'
      );
      items = items.filter(ds => includePattern.test(ds.dataSourceName));
    }

    if (datasourceExcludeFilter) {
      const excludePattern = new RegExp(
        '^' + this.wildcardToRegex(datasourceExcludeFilter) + '$',
        'i'
      );
      items = items.filter(ds => !excludePattern.test(ds.dataSourceName));
    }

    const result: OperationResult<LMDeviceDatasource> = {
      success: true,
      total: items.length,
      items,
      request: {
        deviceId,
        filter,
        size,
        offset,
        fields,
        datasourceIncludeFilter,
        datasourceExcludeFilter
      },
      meta: apiResult.meta,
      raw: apiResult.raw
    };

    this.recordAndStore('list_datasources', result);

    return result;
  }

  /**
   * List instances for a datasource
   */
  private async handleListInstances(args: unknown): Promise<OperationResult<LMDeviceDatasourceInstance>> {
    const validated = validateListInstances(args);
    const { deviceId, datasourceId, filter, size, offset, autoPaginate, fields } = validated;

    const apiResult = await this.client.listDeviceDatasourceInstances(deviceId, datasourceId, {
      filter,
      size,
      offset,
      autoPaginate,
      fields
    });

    const result: OperationResult<LMDeviceDatasourceInstance> = {
      success: true,
      total: apiResult.total,
      items: apiResult.items,
      request: {
        deviceId,
        datasourceId,
        filter,
        size,
        offset,
        fields
      },
      meta: apiResult.meta,
      raw: apiResult.raw
    };

    this.recordAndStore('list_instances', result);

    return result;
  }

  /**
   * Get metric data for instance(s)
   */
  private async handleGetData(args: unknown): Promise<OperationResult<LMDeviceDataFormatted>> {
    const validated = validateGetData(args);
    const {
      deviceId,
      datasourceId,
      instanceId,
      instanceIds,
      startDate,
      endDate,
      start,
      end,
      datapoints,
      format,
      aggregate,
      batchOptions: rawBatchOptions
    } = validated;

    // Calculate time range - default to last 24 hours
    const now = Math.floor(Date.now() / 1000);
    const defaultStart = now - (24 * 60 * 60); // 24 hours ago

    const startEpoch = parseTimeValue(startDate ?? start, defaultStart);
    const endEpoch = parseTimeValue(endDate ?? end, now);

    // Prepare datapoints parameter
    let datapointsParam: string | undefined;
    if (datapoints) {
      datapointsParam = Array.isArray(datapoints) ? datapoints.join(',') : datapoints;
    }

    // Check if this is a batch operation (multiple instances)
    if (instanceIds && Array.isArray(instanceIds) && instanceIds.length > 1) {
      return this.handleBatchGetData(
        deviceId,
        datasourceId,
        instanceIds,
        startEpoch,
        endEpoch,
        datapointsParam,
        format,
        aggregate,
        rawBatchOptions
      );
    }

    // Single instance operation
    const instId = instanceId || (instanceIds && instanceIds[0]);

    if (!instId) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Either instanceId or instanceIds must be provided'
      );
    }

    const apiResult = await this.client.getDeviceData(deviceId, datasourceId, instId, {
      start: startEpoch,
      end: endEpoch,
      datapoints: datapointsParam,
      format,
      aggregate
    });

    // Format the raw data into readable structure
    const formatted = this.formatDeviceData(
      deviceId,
      datasourceId,
      instId,
      apiResult.data
    );

    const result: OperationResult<LMDeviceDataFormatted> = {
      success: true,
      data: formatted,
      request: {
        deviceId,
        datasourceId,
        instanceId: instId,
        startEpoch,
        endEpoch,
        datapoints: datapointsParam
      },
      meta: apiResult.meta,
      raw: apiResult.raw
    };

    this.recordAndStore('get_data', result);

    return result;
  }

  /**
   * Handle batch get data operations for multiple instances
   */
  private async handleBatchGetData(
    deviceId: number,
    datasourceId: number,
    instanceIds: number[],
    startEpoch: number,
    endEpoch: number,
    datapointsParam: string | undefined,
    format: string | undefined,
    aggregate: string | undefined,
    rawBatchOptions: unknown
  ): Promise<OperationResult<LMDeviceDataFormatted>> {
    const batchOptions = (rawBatchOptions as Record<string, unknown>) || {} as Record<string, unknown>;

    // Build batch operations
    const batchOps = instanceIds.map(instId => ({
      instanceId: instId,
      deviceId,
      datasourceId,
      startEpoch,
      endEpoch,
      datapointsParam,
      format,
      aggregate
    }));

    const batchResult = await this.processBatch(
      batchOps,
      async (op) => {
        const apiResult = await this.client.getDeviceData(
          op.deviceId,
          op.datasourceId,
          op.instanceId,
          {
            start: op.startEpoch,
            end: op.endEpoch,
            datapoints: op.datapointsParam,
            format: op.format,
            aggregate: op.aggregate
          }
        );

        return this.formatDeviceData(
          op.deviceId,
          op.datasourceId,
          op.instanceId,
          apiResult.data
        );
      },
      {
        maxConcurrent: (batchOptions.maxConcurrent as number) || 5,
        continueOnError: (batchOptions.continueOnError as boolean) ?? true,
        retryOnRateLimit: true
      }
    );

    const normalized = this.normalizeBatchResults(batchResult as BatchResult<LMDeviceDataFormatted>) as unknown as Array<import('../../utils/batchProcessor.js').BatchItem<LMDeviceDataFormatted>>;
    const successfulItems = normalized
      .filter((entry): entry is typeof entry & { data: LMDeviceDataFormatted } => entry.success && entry.data !== undefined)
      .map(entry => entry.data);

    const result: OperationResult<LMDeviceDataFormatted> = {
      success: batchResult.success,
      items: successfulItems,
      summary: batchResult.summary,
      request: {
        deviceId,
        datasourceId,
        instanceIds,
        startEpoch,
        endEpoch,
        datapoints: datapointsParam,
        batch: true,
        batchOptions
      },
      results: normalized
    };

    this.recordAndStore('get_data', result);

    return result;
  }

  /**
   * Format raw device data into readable structure
   */
  private formatDeviceData(
    deviceId: number,
    datasourceId: number,
    instanceId: number,
    rawData: LMDeviceData
  ): LMDeviceDataFormatted {
    const dataPoints: Array<{
      timestampEpoch: number;
      timestampUTC: string;
      [datapoint: string]: number | string;
    }> = [];

    if (!rawData.time || !rawData.values || !rawData.dataPoints) {
      return {
        deviceId,
        deviceName: '',
        datasourceId,
        datasourceName: '',
        instanceId,
        instanceName: '',
        dataPoints: []
      };
    }

    // Convert raw data into structured format
    for (let i = 0; i < rawData.time.length; i++) {
      const timestamp = rawData.time[i];
      const dataPoint: Record<string, number | string> = {
        timestampEpoch: timestamp,
        timestampUTC: new Date(timestamp).toISOString()
      };

      // Add each metric value
      for (let j = 0; j < rawData.dataPoints.length; j++) {
        const metricName = rawData.dataPoints[j];
        const value = rawData.values[i]?.[j];
        dataPoint[metricName] = value !== null && value !== undefined ? value : 0;
      }

      dataPoints.push(dataPoint as { timestampEpoch: number; timestampUTC: string; [datapoint: string]: number | string });
    }

    return {
      deviceId,
      deviceName: '',
      datasourceId,
      datasourceName: '',
      instanceId,
      instanceName: '',
      dataPoints
    };
  }

  /**
   * Override storeInSession to map custom operations to standard types.
   * list_datasources and list_instances map to 'list'; get_data maps to 'get'.
   */
  protected override storeInSession(operation: OperationType | string, result: OperationResult<DeviceDataType>): void {
    const operationMap: Record<string, OperationType> = {
      'list_datasources': 'list',
      'list_instances': 'list',
      'get_data': 'get'
    };
    const standardOp = operationMap[operation] || (operation as OperationType);
    super.storeInSession(standardOp, result);
  }

  // Required abstract methods from ResourceHandler
  protected async handleList(_args: unknown): Promise<OperationResult<DeviceDataType>> {
    throw new McpError(
      ErrorCode.MethodNotFound,
      'Use list_datasources or list_instances operations instead'
    );
  }

  protected async handleGet(_args: unknown): Promise<OperationResult<DeviceDataType>> {
    throw new McpError(
      ErrorCode.MethodNotFound,
      'Use get_data operation instead'
    );
  }

  protected async handleCreate(_args: unknown): Promise<OperationResult<DeviceDataType>> {
    throw new McpError(
      ErrorCode.MethodNotFound,
      'Device data cannot be created via API'
    );
  }

  protected async handleUpdate(_args: unknown): Promise<OperationResult<DeviceDataType>> {
    throw new McpError(
      ErrorCode.MethodNotFound,
      'Device data cannot be updated via API'
    );
  }

  protected async handleDelete(_args: unknown): Promise<OperationResult<DeviceDataType>> {
    throw new McpError(
      ErrorCode.MethodNotFound,
      'Device data cannot be deleted via API'
    );
  }
}
