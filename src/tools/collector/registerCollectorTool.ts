/**
 * Collector Tool Registration using MCP SDK's high-level registerTool API
 */

import { McpServer } from '@socotra/modelcontextprotocol-sdk/server/mcp.js';
import { CollectorOperationArgsSchema } from '../../resources/collector/collectorZodSchemas.js';
import { CollectorHandler } from '../../resources/collector/collectorHandler.js';
import { buildToolResponse } from '../utils/tool-response.js';

/**
 * Registers the lm_collector tool with the MCP server
 * @param server - The MCP server instance
 * @param createHandler - Factory function to create a CollectorHandler instance
 */
export function registerCollectorTool(
  server: McpServer,
  createHandler: () => CollectorHandler
): void {
  server.registerTool(
    'lm_collector',
    {
      title: 'LogicMonitor Collector Management',
      description: `List LogicMonitor collectors. Currently supports list operation only.

Available fields can be found at: health://logicmonitor/fields/collector

Note: Collector get, create, update, and delete operations are not yet supported.`,
      inputSchema: CollectorOperationArgsSchema
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (args: any) => {
      const handler = createHandler();
      const result = await handler.handleOperation(args);

      return buildToolResponse(args, result, {
        resourceName: 'collector',
        resourceTitle: 'LogicMonitor collector'
      });
    }
  );
}

