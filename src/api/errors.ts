export interface LogicMonitorErrorDetails {
  status?: number;
  code?: string;
  requestId?: string;
  requestUrl?: string;
  requestMethod?: string;
  responseBody?: unknown;
}

export interface LogicMonitorUsageErrorDetails {
  code?: string;
}

export interface LogicMonitorToolErrorDetail {
  code?: string;
  message: string;
  status?: number;
  endpoint?: {
    method?: string;
    url?: string;
    requestId?: string;
  };
}

export class LogicMonitorApiError extends Error {
  public readonly status?: number;
  public readonly code?: string;
  public readonly requestId?: string;
  public readonly requestUrl?: string;
  public readonly requestMethod?: string;
  public readonly responseBody?: unknown;

  constructor(message: string, details: LogicMonitorErrorDetails = {}) {
    super(message);
    this.name = 'LogicMonitorApiError';
    this.status = details.status;
    this.code = details.code;
    this.requestId = details.requestId;
    this.requestUrl = details.requestUrl;
    this.requestMethod = details.requestMethod;
    this.responseBody = details.responseBody;
  }
}

export class LogicMonitorUsageError extends Error {
  public readonly code?: string;

  constructor(message: string, details: LogicMonitorUsageErrorDetails = {}) {
    super(message);
    this.name = 'LogicMonitorUsageError';
    this.code = details.code;
  }
}

export const isLogicMonitorApiError = (error: unknown): error is LogicMonitorApiError => {
  return error instanceof LogicMonitorApiError;
};

export const isLogicMonitorUsageError = (error: unknown): error is LogicMonitorUsageError => {
  return error instanceof LogicMonitorUsageError;
};

export function toLogicMonitorToolErrorDetail(
  error: LogicMonitorApiError | LogicMonitorUsageError
): LogicMonitorToolErrorDetail {
  const endpoint = isLogicMonitorApiError(error)
    ? compactObject({
        method: error.requestMethod,
        url: error.requestUrl,
        requestId: error.requestId,
      })
    : {};

  return compactObject({
    code: error.code,
    message: error.message,
    status: isLogicMonitorApiError(error) ? error.status : undefined,
    endpoint: Object.keys(endpoint).length > 0 ? endpoint : undefined,
  });
}

export function formatLogicMonitorApiError(error: LogicMonitorApiError): string {
  const lines: string[] = [];

  lines.push(`LogicMonitor API error (${error.status ?? 'unknown'}): ${error.message}`);

  const body = error.responseBody as Record<string, unknown> | undefined;
  if (body?.errorDetail && typeof body.errorDetail === 'object') {
    const detail = body.errorDetail as Record<string, unknown>;
    const detailStr = Object.entries(detail)
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .map(([key, value]) => `  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
      .join('\n');

    if (detailStr) {
      lines.push('Error details:');
      lines.push(detailStr);
    }
  }

  if (error.status === 404) lines.push('Hint: Resource not found. Verify the ID by listing resources first.');
  if (error.status === 401 || error.status === 403) lines.push('Hint: Check API token permissions.');
  if (error.status === 429) lines.push('Hint: Rate limited. The server will retry automatically.');

  return lines.join('\n');
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  ) as T;
}
