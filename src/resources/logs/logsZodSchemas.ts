import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { portalOverrideSchema } from '../base/portalArgSchema.js';

const logsExecutionModeSchema = z.enum(['async', 'sync']).default('async').describe(
  'Execution mode for the LM Logs request. Defaults to async.'
);

const logsViewSchema = z.enum(['raw', 'aggregate', 'graph', 'field']).default('raw').describe(
  'Requested LM Logs view for a retained query. Defaults to raw.'
);

export const LogsSearchArgsSchema = z.object({
  operation: z.literal('search').describe('The operation to perform'),
  portal: portalOverrideSchema,
  query: z.string().min(1).describe('LM Logs query text'),
  startAtMs: z.number().int().nonnegative().describe('Inclusive time-window start in epoch milliseconds'),
  endAtMs: z.number().int().nonnegative().describe('Exclusive time-window end in epoch milliseconds'),
  executionMode: logsExecutionModeSchema,
}).strict().superRefine((value, ctx) => {
  if (value.endAtMs <= value.startAtMs) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'endAtMs must be greater than startAtMs',
      path: ['endAtMs'],
    });
  }
});

export const LogsResultArgsSchema = z.object({
  operation: z.literal('result').describe('The operation to perform'),
  portal: portalOverrideSchema,
  queryId: z.string().min(1).describe('Retained LM Logs query ID'),
  view: logsViewSchema,
  query: z.string().min(1).optional().describe('Optional follow-up query filter for the retained request'),
  startAtMs: z.number().int().nonnegative().optional().describe('Optional follow-up time-window start in epoch milliseconds'),
  endAtMs: z.number().int().nonnegative().optional().describe('Optional follow-up time-window end in epoch milliseconds'),
  executionMode: logsExecutionModeSchema,
}).strict().superRefine((value, ctx) => {
  const hasStart = typeof value.startAtMs === 'number';
  const hasEnd = typeof value.endAtMs === 'number';
  const hasQuery = typeof value.query === 'string' && value.query.trim().length > 0;

  if (hasStart !== hasEnd) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'startAtMs and endAtMs must be provided together',
      path: hasStart ? ['endAtMs'] : ['startAtMs'],
    });
  }

  if (hasQuery && (!hasStart || !hasEnd)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'query requires both startAtMs and endAtMs',
      path: ['startAtMs'],
    });
  }

  if (hasStart && hasEnd && value.endAtMs! <= value.startAtMs!) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'endAtMs must be greater than startAtMs',
      path: ['endAtMs'],
    });
  }
});

export const LogsDeleteArgsSchema = z.object({
  operation: z.literal('delete').describe('The operation to perform'),
  portal: portalOverrideSchema,
  queryId: z.string().min(1).describe('Retained LM Logs query ID to delete'),
}).strict();

export const LogsOperationArgsSchema = z.discriminatedUnion('operation', [
  LogsSearchArgsSchema,
  LogsResultArgsSchema,
  LogsDeleteArgsSchema,
]);

export type LogsSearchArgs = z.infer<typeof LogsSearchArgsSchema>;
export type LogsResultArgs = z.infer<typeof LogsResultArgsSchema>;
export type LogsDeleteArgs = z.infer<typeof LogsDeleteArgsSchema>;
export type LogsOperationArgs = z.infer<typeof LogsOperationArgsSchema>;
export type LogsExecutionMode = z.infer<typeof logsExecutionModeSchema>;
export type LogsView = z.infer<typeof logsViewSchema>;

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${String(issue.path.join('.'))}: ${issue.message}`)
    .join(', ');
}

export function validateLogsSearch(args: unknown): LogsSearchArgs {
  const result = LogsSearchArgsSchema.safeParse(args);
  if (!result.success) {
    throw new McpError(ErrorCode.InvalidParams, `Validation error: ${formatZodError(result.error)}`);
  }
  return result.data;
}

export function validateLogsResult(args: unknown): LogsResultArgs {
  const result = LogsResultArgsSchema.safeParse(args);
  if (!result.success) {
    throw new McpError(ErrorCode.InvalidParams, `Validation error: ${formatZodError(result.error)}`);
  }
  return result.data;
}

export function validateLogsDelete(args: unknown): LogsDeleteArgs {
  const result = LogsDeleteArgsSchema.safeParse(args);
  if (!result.success) {
    throw new McpError(ErrorCode.InvalidParams, `Validation error: ${formatZodError(result.error)}`);
  }
  return result.data;
}
