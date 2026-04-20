import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { LogicMonitorApiError } from '../../api/errors.js';
import type { LogicMonitorClient } from '../../api/client.js';
import { SessionManager } from '../../session/sessionManager.js';
import type {
  CreateOperationArgs,
  DeleteOperationArgs,
  GetOperationArgs,
  ListOperationArgs,
  OperationResult,
  OperationType,
  UpdateOperationArgs,
} from '../../types/operations.js';
import { ResourceHandler } from '../base/resourceHandler.js';
import type {
  LogsExecutionMode,
  LogsResultArgs,
  LogsSearchArgs,
  LogsView,
} from './logsZodSchemas.js';
import {
  validateLogsDelete,
  validateLogsResult,
  validateLogsSearch,
} from './logsZodSchemas.js';

const LM_LOGS_API_VERSION = '4' as const;
const LM_LOGS_BASE_PATH = '/santaba/rest' as const;
const LM_LOGS_SEARCH_ENDPOINT = '/log/search';
const DEFAULT_PER_PAGE_COUNT = 100;

type LogsLifecycleOperation = 'search' | 'result' | 'delete';

type LogsRequestEcho = {
  portal: string;
  query?: string;
  queryId?: string;
  view?: LogsView;
  executionMode?: LogsExecutionMode;
  range?: {
    startAtMs?: number;
    endAtMs?: number;
  };
};

type LogsResponseMeta = {
  endpoint: string;
  method: 'post' | 'delete';
  status: number;
  timestamp: string;
  payloadMeta: Record<string, unknown> | null;
};

export type LogsOperationData = {
  surface: 'lm_logs';
  operation: LogsLifecycleOperation;
  portal: string;
  apiVersion: typeof LM_LOGS_API_VERSION;
  queryId: string;
  request: LogsRequestEcho;
  responseMeta: LogsResponseMeta;
  cleanup?: {
    deleted: boolean;
    queryId: string;
    status: number;
  };
  raw: unknown;
};

export class LogsHandler extends ResourceHandler<LogsOperationData> {
  constructor(
    client: LogicMonitorClient,
    sessionManager: SessionManager,
    sessionId?: string
  ) {
    super(
      {
        resourceType: 'logs',
        resourceName: 'logs',
        idField: 'queryId',
      },
      client,
      sessionManager,
      sessionId
    );
  }

  protected override async handleCustomOperation(
    operation: string,
    args: unknown
  ): Promise<OperationResult<LogsOperationData> | null> {
    switch (operation) {
      case 'search':
        return this.handleSearch(args);
      case 'result':
        return this.handleResult(args);
      case 'delete':
        return this.handleLogsDelete(args);
      default:
        return null;
    }
  }

  protected override storeInSession(
    operation: OperationType,
    result: OperationResult<LogsOperationData>
  ): void {
    if (!result.data) {
      return;
    }

    if (operation === 'search' || operation === 'result') {
      this.sessionContext.variables.lastLogs = result.data;
      this.sessionContext.variables.lastLogsQueryId = result.data.queryId;
      return;
    }

    if (operation === 'delete') {
      this.sessionContext.variables.lastDeletedLogsQueryId = result.data.queryId;
    }
  }

  protected async handleList(_args: ListOperationArgs): Promise<OperationResult<LogsOperationData>> {
    throw this.unsupportedCrudOperation();
  }

  protected async handleGet(_args: GetOperationArgs): Promise<OperationResult<LogsOperationData>> {
    throw this.unsupportedCrudOperation();
  }

  protected async handleCreate(_args: CreateOperationArgs): Promise<OperationResult<LogsOperationData>> {
    throw this.unsupportedCrudOperation();
  }

  protected async handleUpdate(_args: UpdateOperationArgs): Promise<OperationResult<LogsOperationData>> {
    throw this.unsupportedCrudOperation();
  }

  protected async handleDelete(_args: DeleteOperationArgs): Promise<OperationResult<LogsOperationData>> {
    throw this.unsupportedCrudOperation();
  }

  private unsupportedCrudOperation(): McpError {
    return new McpError(
      ErrorCode.InvalidParams,
      'lm_logs only supports the search, result, and delete operations.'
    );
  }

  private async handleSearch(args: unknown): Promise<OperationResult<LogsOperationData>> {
    const validated = validateLogsSearch(args);
    const request = {
      portal: this.resolvePortal(validated.portal),
      query: validated.query,
      range: {
        startAtMs: validated.startAtMs,
        endAtMs: validated.endAtMs,
      },
      executionMode: validated.executionMode,
    };

    const response = await this.client.request(
      {
        method: 'post',
        url: LM_LOGS_SEARCH_ENDPOINT,
        data: this.buildSearchPayload(validated),
      },
      {
        apiVersion: LM_LOGS_API_VERSION,
        basePath: LM_LOGS_BASE_PATH,
      }
    );

    const payload = response.data;
    const queryId = this.extractQueryId(payload, undefined, 'search');
    const result: OperationResult<LogsOperationData> = {
      success: true,
      data: this.buildOperationData({
        operation: 'search',
        portal: request.portal,
        queryId,
        request,
        endpoint: LM_LOGS_SEARCH_ENDPOINT,
        method: 'post',
        status: response.status,
        payload,
      }),
    };

    this.recordAndStore('search', result);
    return result;
  }

  private async handleResult(args: unknown): Promise<OperationResult<LogsOperationData>> {
    const validated = validateLogsResult(args);
    const request: LogsRequestEcho = {
      portal: this.resolvePortal(validated.portal),
      queryId: validated.queryId,
      query: validated.query,
      view: validated.view,
      executionMode: validated.executionMode,
      range: validated.startAtMs !== undefined && validated.endAtMs !== undefined
        ? {
            startAtMs: validated.startAtMs,
            endAtMs: validated.endAtMs,
          }
        : undefined,
    };

    const response = await this.client.request(
      {
        method: 'post',
        url: LM_LOGS_SEARCH_ENDPOINT,
        data: this.buildResultPayload(validated),
      },
      {
        apiVersion: LM_LOGS_API_VERSION,
        basePath: LM_LOGS_BASE_PATH,
      }
    );

    const payload = response.data;
    const queryId = this.extractQueryId(payload, validated.queryId, 'result');
    const result: OperationResult<LogsOperationData> = {
      success: true,
      data: this.buildOperationData({
        operation: 'result',
        portal: request.portal,
        queryId,
        request,
        endpoint: LM_LOGS_SEARCH_ENDPOINT,
        method: 'post',
        status: response.status,
        payload,
      }),
    };

    this.recordAndStore('result', result);
    return result;
  }

  private async handleLogsDelete(args: unknown): Promise<OperationResult<LogsOperationData>> {
    const validated = validateLogsDelete(args);
    const portal = this.resolvePortal(validated.portal);
    const endpoint = `${LM_LOGS_SEARCH_ENDPOINT}/${encodeURIComponent(validated.queryId)}`;
    const response = await this.client.request(
      {
        method: 'delete',
        url: endpoint,
      },
      {
        apiVersion: LM_LOGS_API_VERSION,
        basePath: LM_LOGS_BASE_PATH,
      }
    );

    const payload = response.data ?? null;
    const result: OperationResult<LogsOperationData> = {
      success: true,
      data: this.buildOperationData({
        operation: 'delete',
        portal,
        queryId: validated.queryId,
        request: {
          portal,
          queryId: validated.queryId,
        },
        endpoint,
        method: 'delete',
        status: response.status,
        payload,
        cleanup: {
          deleted: true,
          queryId: validated.queryId,
          status: response.status,
        },
      }),
    };

    this.recordAndStore('delete', result);
    return result;
  }

  private resolvePortal(portalOverride?: string): string {
    const trimmed = portalOverride?.trim().toLowerCase();
    return trimmed || this.client.getAccount();
  }

  private buildSearchPayload(args: LogsSearchArgs): { meta: Record<string, unknown> } {
    return {
      meta: {
        isAsync: args.executionMode === 'async',
        perPageCount: DEFAULT_PER_PAGE_COUNT,
        filter: {
          query: args.query,
          range: {
            startAtMS: args.startAtMs,
            endAtMS: args.endAtMs,
          },
        },
      },
    };
  }

  private buildResultPayload(args: LogsResultArgs): { meta: Record<string, unknown> } {
    const meta: Record<string, unknown> = {
      isAsync: args.executionMode === 'async',
      perPageCount: DEFAULT_PER_PAGE_COUNT,
      queryId: args.queryId,
      queryType: args.view,
    };

    if (args.startAtMs !== undefined && args.endAtMs !== undefined) {
      meta.filter = {
        query: args.query ?? '',
        range: {
          startAtMS: args.startAtMs,
          endAtMS: args.endAtMs,
        },
      };
    }

    return { meta };
  }

  private extractPayloadMeta(payload: unknown): Record<string, unknown> | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    const meta = (payload as Record<string, unknown>).meta;
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
      return null;
    }

    return { ...(meta as Record<string, unknown>) };
  }

  private extractQueryId(
    payload: unknown,
    fallbackQueryId: string | undefined,
    operation: Exclude<LogsLifecycleOperation, 'delete'>
  ): string {
    const payloadMeta = this.extractPayloadMeta(payload);
    const responseQueryId = typeof payloadMeta?.queryId === 'string'
      ? payloadMeta.queryId.trim()
      : '';
    const fallback = typeof fallbackQueryId === 'string' ? fallbackQueryId.trim() : '';
    const queryId = responseQueryId || fallback;

    if (queryId) {
      return queryId;
    }

    throw new LogicMonitorApiError(
      `LM Logs ${operation} response did not include a queryId.`,
      {
        code: 'LM_LOGS_PROTOCOL_ERROR',
        requestUrl: LM_LOGS_SEARCH_ENDPOINT,
        requestMethod: 'POST',
        responseBody: payload,
      }
    );
  }

  private buildOperationData(args: {
    operation: LogsLifecycleOperation;
    portal: string;
    queryId: string;
    request: LogsRequestEcho;
    endpoint: string;
    method: 'post' | 'delete';
    status: number;
    payload: unknown;
    cleanup?: {
      deleted: boolean;
      queryId: string;
      status: number;
    };
  }): LogsOperationData {
    return {
      surface: 'lm_logs',
      operation: args.operation,
      portal: args.portal,
      apiVersion: LM_LOGS_API_VERSION,
      queryId: args.queryId,
      request: args.request,
      responseMeta: {
        endpoint: args.endpoint,
        method: args.method,
        status: args.status,
        timestamp: new Date().toISOString(),
        payloadMeta: this.extractPayloadMeta(args.payload),
      },
      ...(args.cleanup ? { cleanup: args.cleanup } : {}),
      raw: args.payload,
    };
  }
}
