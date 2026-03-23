/**
 * Converts MCP tool schemas to OpenAI function calling format.
 * Reuses the exact pipeline from src/server.ts:394-422.
 */

import { TOOL_DEFINITIONS } from '../../src/tools/registry.js';
import { flattenDiscriminatedUnion } from '../../src/schemas/zodToJsonSchema.js';
import type { OpenAIFunctionTool } from './providers/types.js';

// Dynamically import MCP SDK's Zod-to-JSON-Schema converter (ESM)
let _toJsonSchemaCompat: ((schema: unknown, opts: Record<string, unknown>) => Record<string, unknown>) | null = null;

async function getToJsonSchemaCompat() {
  if (!_toJsonSchemaCompat) {
    const mod = await import('@modelcontextprotocol/sdk/server/zod-json-schema-compat.js');
    _toJsonSchemaCompat = mod.toJsonSchemaCompat;
  }
  return _toJsonSchemaCompat;
}

/**
 * Convert all MCP tool definitions to OpenAI function calling format.
 * This produces the same schemas LLMs see via the MCP ListTools handler.
 */
export async function convertMCPToolsToOpenAI(): Promise<OpenAIFunctionTool[]> {
  const toJsonSchemaCompat = await getToJsonSchemaCompat();
  const tools: OpenAIFunctionTool[] = [];

  for (const def of TOOL_DEFINITIONS) {
    let parameters: Record<string, unknown> = { type: 'object', properties: {} };

    if (def.inputSchema) {
      const jsonSchema = toJsonSchemaCompat(def.inputSchema, {
        strictUnions: true,
        pipeStrategy: 'input'
      }) as Record<string, unknown>;

      // Zod v4 may produce oneOf instead of anyOf — normalize before flattening
      const normalized = normalizeUnionKey(jsonSchema);

      parameters = (normalized.anyOf && Array.isArray(normalized.anyOf))
        ? flattenDiscriminatedUnion(normalized) as Record<string, unknown>
        : normalized;

      // OpenAI requires top-level type: "object" — strip $schema if present
      delete parameters.$schema;
    }

    tools.push({
      type: 'function',
      function: {
        name: def.name,
        description: def.description || '',
        parameters,
      }
    });
  }

  return tools;
}

/**
 * Normalize oneOf to anyOf so flattenDiscriminatedUnion can process it.
 * Zod v4's toJsonSchemaCompat produces oneOf; our flattener expects anyOf.
 */
function normalizeUnionKey(schema: Record<string, unknown>): Record<string, unknown> {
  if (schema.oneOf && Array.isArray(schema.oneOf) && !schema.anyOf) {
    const { oneOf, ...rest } = schema;
    // Recursively normalize nested oneOf in branches
    const normalized = (oneOf as Record<string, unknown>[]).map(branch => {
      if (typeof branch === 'object' && branch !== null) {
        return normalizeUnionKey(branch as Record<string, unknown>);
      }
      return branch;
    });
    return { ...rest, anyOf: normalized };
  }
  return schema;
}

/**
 * Get the server instructions that LLMs receive on MCP initialization.
 * Used as the system prompt for eval scenarios.
 */
export function buildEvalSystemPrompt(): string {
  return [
    'You are a LogicMonitor API assistant using the Model Context Protocol (MCP).',
    'You have access to LogicMonitor tools for managing devices, device groups, alerts, websites, website groups, collectors, collector groups, users, dashboards, device monitoring data, and session state.',
    '',
    'Guidelines:',
    '1) Use the "operation" parameter to specify what action to take (list, get, create, update, delete, etc.).',
    '2) For filters, use LM filter expression syntax like "displayName:*prod*" or "severity>:2".',
    '3) Use the "id" parameter (not resource-specific aliases like deviceId) when targeting a specific resource.',
    '4) For batch operations on previous results, use the "applyToPrevious" parameter with the session variable name.',
    '5) Always use the "fields" parameter to request only the fields you need.',
    '',
    'Based on the user request, select the appropriate tool and provide the correct arguments.',
    'Always respond with a tool call. Do not respond with text only.',
  ].join('\n');
}
