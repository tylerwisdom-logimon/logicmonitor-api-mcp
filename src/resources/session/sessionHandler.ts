/**
 * Session Resource Handler
 * Handles session context operations (list history, get context, set/update variables, clear)
 */

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ResourceHandler } from '../base/resourceHandler.js';
import { SessionManager, SessionScope } from '../../session/sessionManager.js';
import { fetchAvailablePortals } from '../../api/sessionAuth.js';
import type { LMCredentials } from '../../auth/lmCredentials.js';
import { createSessionCredentials, normalizePortal, serializeCredentialsIdentity } from '../../auth/lmCredentials.js';
import {
  DEFAULT_PORTAL_KEY,
  buildPortalScopedSessionId,
  getDefaultPortal,
  getPortalScopeCapabilities,
  getPortalScope,
  getVisibleVariableKeys,
  getVisibleVariables,
  listPortalScopes,
  registerPortalScope,
  setDefaultPortal,
} from '../../session/portalSessionState.js';
import type {
  ListOperationArgs,
  GetOperationArgs,
  CreateOperationArgs,
  UpdateOperationArgs,
  DeleteOperationArgs,
  OperationType,
  OperationResult
} from '../../types/operations.js';
import { validateSessionOperation } from './sessionZodSchemas.js';

interface SessionData {
  capabilities?: {
    sessionBackedApiV4: boolean;
    lmLogs: boolean;
  };
  sessionId?: string;
  variables?: Record<string, unknown>;
  lastResults?: Record<string, unknown> | string[];
  history?: Array<{
    timestamp: string;
    tool: string;
    arguments: unknown;
    summary: string;
  }>;
  lastOperation?: {
    type: string;
    operation: string;
    result: unknown;
    timestamp: string;
  };
  key?: string;
  value?: unknown;
  found?: boolean;
  message?: string;
  success?: boolean;
  cleared?: string;
  remainingVariables?: string[];
  remainingResultKeys?: string[];
  historyEntries?: number;
  availableResultKeys?: string[] | Record<string, unknown>;
  storedVariables?: string[];
  defaultPortal?: string;
  availablePortals?: string[];
  portal?: string;
  portalScopes?: Array<{
    portal: string;
    sessionId: string;
    storedVariables: string[];
    availableResultKeys: string[];
    historyEntries: number;
    capabilities: {
      sessionBackedApiV4: boolean;
      lmLogs: boolean;
    };
  }>;
}

interface SessionHandlerOptions {
  credentials?: LMCredentials;
  apiTimeoutMs?: number;
}

export class SessionHandler extends ResourceHandler<SessionData> {
  private readonly credentials?: LMCredentials;
  private readonly apiTimeoutMs: number;

  constructor(
    sessionManager: SessionManager,
    sessionId?: string,
    options: SessionHandlerOptions = {}
  ) {
    super(
      {
        resourceType: 'session',
        resourceName: 'session',
        idField: 'sessionId'
      },
      undefined,
      sessionManager,
      sessionId
    );

    this.credentials = options.credentials;
    this.apiTimeoutMs = options.apiTimeoutMs ?? 30000;
  }

  private async getSessionIdForPortal(portal?: string): Promise<string> {
    if (!portal) {
      return this.sessionContext.id;
    }

    const normalizedPortal = normalizePortal(portal);
    if (!this.credentials || this.credentials.kind === 'bearer') {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Portal-scoped session inspection is only available when listener-based LogicMonitor auth is configured."
      );
    }

    const availablePortals = await this.getAvailablePortals();
    if (availablePortals && !availablePortals.includes(normalizedPortal)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Unknown LogicMonitor portal '${normalizedPortal}'. Listener reported available portals: ${availablePortals.join(', ')}.`
      );
    }

    const existingScope = getPortalScope(this.sessionManager, this.sessionContext.id, normalizedPortal);
    if (existingScope) {
      return existingScope.sessionId;
    }

    const listenerBaseUrl = this.credentials.lm_session_listener_base_url;
    const scopedSessionId = buildPortalScopedSessionId(this.sessionContext.id, normalizedPortal, listenerBaseUrl);
    registerPortalScope(
      this.sessionManager,
      this.sessionContext.id,
      normalizedPortal,
      scopedSessionId,
      serializeCredentialsIdentity(createSessionCredentials(normalizedPortal, listenerBaseUrl))
    );
    return scopedSessionId;
  }

  private async getAvailablePortals(): Promise<string[] | undefined> {
    if (!this.credentials || this.credentials.kind === 'bearer') {
      return undefined;
    }

    try {
      return await fetchAvailablePortals(this.credentials, this.apiTimeoutMs);
    } catch {
      return undefined;
    }
  }

  private buildPortalScopeSummaries(): SessionData['portalScopes'] {
    return listPortalScopes(this.sessionManager, this.sessionContext.id).map((scope) => {
      const scopedContext = this.sessionManager.getContext(scope.sessionId);
      return {
        portal: scope.portal,
        sessionId: scope.sessionId,
        storedVariables: getVisibleVariableKeys(scopedContext.variables),
        availableResultKeys: Object.keys(scopedContext.lastResults),
        historyEntries: scopedContext.history.length,
        capabilities: getPortalScopeCapabilities(scope),
      };
    });
  }

  private getTargetPortalCapabilities(portal: string): NonNullable<SessionData['capabilities']> {
    const scope = getPortalScope(this.sessionManager, this.sessionContext.id, portal);

    if (scope) {
      return getPortalScopeCapabilities(scope);
    }

    const sessionBackedApiV4 = Boolean(this.credentials && this.credentials.kind !== 'bearer');

    return {
      sessionBackedApiV4,
      lmLogs: sessionBackedApiV4,
    };
  }

  private mirrorPortalScopedSessionActivity(
    targetSessionId: string,
    operation: OperationType,
    request: Record<string, unknown>,
    result: OperationResult<SessionData>,
    portal?: string
  ): void {
    if (!portal || targetSessionId === this.sessionContext.id) {
      return;
    }

    this.sessionManager.recordResult(targetSessionId, 'lm_session', request, result);
    this.sessionManager.recordOperation(targetSessionId, 'session', operation, result);
  }

  private buildSnapshotData(
    sessionId: string,
    options?: { historyLimit?: number; includeResults?: boolean }
  ): Pick<SessionData, 'sessionId' | 'variables' | 'lastResults' | 'history' | 'lastOperation'> {
    const snapshot = this.sessionManager.getSnapshot(sessionId, options);
    return {
      sessionId: snapshot.sessionId,
      variables: getVisibleVariables(snapshot.variables as Record<string, unknown>),
      lastResults: snapshot.lastResults,
      history: snapshot.history,
      lastOperation: snapshot.lastOperation,
    };
  }

  /**
   * List operation - Returns session history
   * Maps to old lm_list_session_history
   */
  protected async handleList(args: ListOperationArgs): Promise<OperationResult<SessionData>> {
    const validated = validateSessionOperation(args) as Extract<ReturnType<typeof validateSessionOperation>, { operation: 'list' }>;
    const { limit, portal } = validated as typeof validated & { portal?: string };
    const targetSessionId = await this.getSessionIdForPortal(portal);

    const snapshot = this.sessionManager.getSnapshot(targetSessionId, {
      historyLimit: limit ?? 10,
      includeResults: false
    });

    const data: SessionData = {
      history: snapshot.history,
      availableResultKeys: snapshot.lastResults,
      storedVariables: getVisibleVariableKeys(this.sessionManager.getContext(targetSessionId).variables)
    };

    if (!portal) {
      data.defaultPortal = getDefaultPortal(this.sessionManager, this.sessionContext.id);
      data.availablePortals = await this.getAvailablePortals();
      data.portalScopes = this.buildPortalScopeSummaries();
    } else {
      data.portal = normalizePortal(portal);
      data.capabilities = this.getTargetPortalCapabilities(data.portal);
    }

    const result: OperationResult<SessionData> = {
      success: true,
      data,
      request: {
        limit: limit ?? 10,
        ...(portal ? { portal: normalizePortal(portal) } : {})
      }
    };

    this.mirrorPortalScopedSessionActivity(targetSessionId, 'list', result.request ?? {}, result, portal);
    return result;
  }

  /**
   * Get operation - Returns session context or specific variable
   * Maps to old lm_get_session_context and lm_get_session_variable
   */
  protected async handleGet(args: GetOperationArgs): Promise<OperationResult<SessionData>> {
    const validated = validateSessionOperation(args) as Extract<ReturnType<typeof validateSessionOperation>, { operation: 'get' }>;
    const { key, historyLimit, includeResults, portal } = validated as typeof validated & { portal?: string };
    const fields = (validated as Record<string, unknown>).fields as string | undefined;
    const index = (validated as Record<string, unknown>).index as number | undefined;
    const limit = (validated as Record<string, unknown>).limit as number | undefined;
    const targetSessionId = key === DEFAULT_PORTAL_KEY
      ? this.sessionContext.id
      : await this.getSessionIdForPortal(portal);

    // If key is provided, get specific variable
    if (key) {
      const { value: rawValue, exists } = this.sessionManager.getVariable(targetSessionId, key);

      if (!exists) {
        const result: OperationResult<SessionData> = {
          success: true,
          data: {
            found: false,
            message: `No session variable named '${key}' was found.`
          },
          request: {
            key,
            ...(portal ? { portal: normalizePortal(portal) } : {})
          }
        };
        this.mirrorPortalScopedSessionActivity(targetSessionId, 'get', result.request ?? {}, result, portal);
        return result;
      }

      // Apply filters if the value is an array
      let value: unknown = rawValue;
      if (Array.isArray(value)) {
        // index: return single item
        if (typeof index === 'number') {
          value = index < value.length ? value[index] : null;
        } else {
          // limit: slice the array first
          if (typeof limit === 'number') {
            value = (value as unknown[]).slice(0, limit);
          }
          // fields: project each item to only requested fields
          if (fields && Array.isArray(value)) {
            const fieldList = fields.split(',').map((f: string) => f.trim());
            value = (value as Array<Record<string, unknown>>).map(item => {
              if (typeof item === 'object' && item !== null) {
                return Object.fromEntries(
                  fieldList.filter(f => f in (item as Record<string, unknown>)).map(f => [f, (item as Record<string, unknown>)[f]])
                );
              }
              return item;
            });
          }
        }
      }

      const result: OperationResult<SessionData> = {
        success: true,
        data: {
          found: true,
          key,
          value,
          ...(portal ? { portal: normalizePortal(portal) } : {})
        },
        request: {
          key,
          ...(fields ? { fields } : {}),
          ...(typeof index === 'number' ? { index } : {}),
          ...(typeof limit === 'number' ? { limit } : {}),
          ...(portal ? { portal: normalizePortal(portal) } : {})
        }
      };
      this.mirrorPortalScopedSessionActivity(targetSessionId, 'get', result.request ?? {}, result, portal);
      return result;
    }

    const data = this.buildSnapshotData(targetSessionId, {
      historyLimit,
      includeResults
    });

    const result: OperationResult<SessionData> = {
      success: true,
      data: {
        ...data,
        ...(portal ? { portal: normalizePortal(portal) } : {}),
        ...(portal ? { capabilities: this.getTargetPortalCapabilities(normalizePortal(portal)) } : {}),
        ...(!portal
          ? {
              defaultPortal: getDefaultPortal(this.sessionManager, this.sessionContext.id),
              availablePortals: await this.getAvailablePortals(),
              portalScopes: this.buildPortalScopeSummaries(),
            }
          : {})
      },
      request: {
        historyLimit: historyLimit ?? 10,
        includeResults: includeResults ?? false,
        ...(portal ? { portal: normalizePortal(portal) } : {})
      }
    };

    this.mirrorPortalScopedSessionActivity(targetSessionId, 'get', result.request ?? {}, result, portal);
    return result;
  }

  /**
   * Create operation - Sets a new session variable
   * Maps to old lm_set_session_variable
   */
  protected async handleCreate(args: CreateOperationArgs): Promise<OperationResult<SessionData>> {
    const validated = validateSessionOperation(args) as Extract<ReturnType<typeof validateSessionOperation>, { operation: 'create' }>;
    const { key, value, portal } = validated as typeof validated & { portal?: string };

    if (key === DEFAULT_PORTAL_KEY) {
      if (value !== null && typeof value !== 'string') {
        throw new McpError(
          ErrorCode.InvalidParams,
          "lm_session key 'defaultPortal' must be a string or null."
        );
      }

      const context = setDefaultPortal(
        this.sessionManager,
        this.sessionContext.id,
        value
      );
      const defaultPortal = getDefaultPortal(this.sessionManager, this.sessionContext.id);

      return {
        success: true,
        data: {
          success: true,
          message: defaultPortal
            ? `Stored default portal '${defaultPortal}'.`
            : 'Cleared the default portal.',
          defaultPortal,
          storedVariables: getVisibleVariableKeys(context.variables)
        },
        request: {
          key,
          value
        }
      };
    }

    const targetSessionId = await this.getSessionIdForPortal(portal);
    const context = this.sessionManager.setVariable(targetSessionId, key, value);

    const result: OperationResult<SessionData> = {
      success: true,
      data: {
        success: true,
        message: `Stored session variable '${key}'.`,
        storedVariables: getVisibleVariableKeys(context.variables),
        ...(portal ? { portal: normalizePortal(portal) } : {})
      },
      request: {
        key,
        value,
        ...(portal ? { portal: normalizePortal(portal) } : {})
      }
    };

    this.mirrorPortalScopedSessionActivity(targetSessionId, 'create', result.request ?? {}, result, portal);
    return result;
  }

  /**
   * Update operation - Updates an existing session variable
   * Maps to old lm_set_session_variable (same behavior as create)
   */
  protected async handleUpdate(args: UpdateOperationArgs): Promise<OperationResult<SessionData>> {
    const validated = validateSessionOperation(args) as Extract<ReturnType<typeof validateSessionOperation>, { operation: 'update' }>;
    const { key, value, portal } = validated as typeof validated & { portal?: string };

    if (key === DEFAULT_PORTAL_KEY) {
      if (value !== null && typeof value !== 'string') {
        throw new McpError(
          ErrorCode.InvalidParams,
          "lm_session key 'defaultPortal' must be a string or null."
        );
      }

      const context = setDefaultPortal(
        this.sessionManager,
        this.sessionContext.id,
        value
      );
      const defaultPortal = getDefaultPortal(this.sessionManager, this.sessionContext.id);

      return {
        success: true,
        data: {
          success: true,
          message: defaultPortal
            ? `Updated default portal to '${defaultPortal}'.`
            : 'Cleared the default portal.',
          defaultPortal,
          storedVariables: getVisibleVariableKeys(context.variables)
        },
        request: {
          key,
          value
        }
      };
    }

    const targetSessionId = await this.getSessionIdForPortal(portal);
    const context = this.sessionManager.setVariable(targetSessionId, key, value);

    const result: OperationResult<SessionData> = {
      success: true,
      data: {
        success: true,
        message: `Updated session variable '${key}'.`,
        storedVariables: getVisibleVariableKeys(context.variables),
        ...(portal ? { portal: normalizePortal(portal) } : {})
      },
      request: {
        key,
        value,
        ...(portal ? { portal: normalizePortal(portal) } : {})
      }
    };

    this.mirrorPortalScopedSessionActivity(targetSessionId, 'update', result.request ?? {}, result, portal);
    return result;
  }

  /**
   * Delete operation - Clears session context
   * Maps to old lm_clear_session_context
   */
  protected async handleDelete(args: DeleteOperationArgs): Promise<OperationResult<SessionData>> {
    const validated = validateSessionOperation(args) as Extract<ReturnType<typeof validateSessionOperation>, { operation: 'delete' }>;
    const { scope, portal } = validated as typeof validated & { portal?: string };
    const targetSessionId = await this.getSessionIdForPortal(portal);

    const updatedContext = this.sessionManager.clear(
      targetSessionId,
      (scope as SessionScope) ?? 'all'
    );

    const result: OperationResult<SessionData> = {
      success: true,
      data: {
        success: true,
        cleared: scope ?? 'all',
        remainingVariables: getVisibleVariableKeys(updatedContext.variables),
        remainingResultKeys: Object.keys(updatedContext.lastResults),
        historyEntries: updatedContext.history.length,
        ...(portal ? { portal: normalizePortal(portal) } : {})
      },
      request: {
        scope: scope ?? 'all',
        ...(portal ? { portal: normalizePortal(portal) } : {})
      }
    };

    this.mirrorPortalScopedSessionActivity(targetSessionId, 'delete', result.request ?? {}, result, portal);

    if (portal && targetSessionId !== this.sessionContext.id) {
      const finalContext = this.sessionManager.getContext(targetSessionId);
      result.data = {
        ...result.data,
        remainingVariables: getVisibleVariableKeys(finalContext.variables),
        remainingResultKeys: Object.keys(finalContext.lastResults),
        historyEntries: finalContext.history.length,
      };
    }

    return result;
  }
}
