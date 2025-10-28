import { LogicMonitorApiError } from '../api/errors.js';
import type { BatchItem } from './batchProcessor.js';

export function throwBatchFailure(action: string, entry: BatchItem<unknown>): never {
  const message = entry.error || `${action} failed`;

  if (entry.diagnostics) {
    throw new LogicMonitorApiError(message, {
      status: entry.diagnostics.status,
      code: entry.diagnostics.code,
      requestId: entry.diagnostics.requestId,
      requestUrl: entry.diagnostics.requestUrl,
      requestMethod: entry.diagnostics.requestMethod
    });
  }

  throw new Error(message);
}
