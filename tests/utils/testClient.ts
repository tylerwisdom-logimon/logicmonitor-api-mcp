/**
 * Test client wrapper for MCP server
 * Provides a simplified interface for testing tool calls
 */

import { createServer, ServerConfig } from '../../src/server.js';
import { SessionManager } from '../../src/session/sessionManager.js';
import winston from 'winston';

export interface ToolCallResult {
  success: boolean;
  content: Array<{ type: string; text: string }>;
  data?: unknown;
  error?: string;
}

export class TestMCPClient {
  private server: Awaited<ReturnType<typeof createServer>>;
  private sessionManager: SessionManager;
  private sessionId: string;
  private logger: winston.Logger;

  constructor(
    lmAccount: string,
    lmBearerToken: string,
    sessionId: string = 'test-session'
  ) {
    this.sessionId = sessionId;
    this.sessionManager = new SessionManager();
    
    // Create a logger that only logs errors in tests
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'error',
      format: winston.format.json(),
      transports: [new winston.transports.Console({ silent: process.env.LOG_LEVEL !== 'debug' })],
    });

    // Initialize server (will be set in init())
    this.server = null as any;
    
    // Store credentials for init
    this._credentials = {
      lmAccount,
      lmBearerToken,
    };
  }

  private _credentials: { lmAccount: string; lmBearerToken: string };

  async init(): Promise<void> {
    const config: ServerConfig = {
      credentials: {
        lm_account: this._credentials.lmAccount,
        lm_bearer_token: this._credentials.lmBearerToken,
      },
      sessionManager: this.sessionManager,
      logger: this.logger,
    };

    this.server = await createServer(config);
  }

  /**
   * Call a tool and return the parsed result
   */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    try {
      // Get the request handler
      const handler = (this.server.server as any)._requestHandlers.get('tools/call');
      
      if (!handler) {
        throw new Error('Tool call handler not found');
      }

      const request = {
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args,
        },
      };

      const extra = {
        sessionId: this.sessionId,
      };

      const response = await handler(request, extra);

      // Parse the response
      const content = response.content || [];
      let data: unknown = undefined;

      for (const block of content) {
        if (block.type !== 'text' || typeof block.text !== 'string') {
          continue;
        }

        if (!block.text.trim()) {
          continue;
        }

        try {
          data = JSON.parse(block.text);
          break;
        } catch {
          if (typeof data === 'undefined') {
            data = block.text;
          }
        }
      }

      if (typeof data === 'undefined' && content.length > 0 && content[0].type === 'text') {
        data = content[0].text;
      }

      return {
        success: true,
        content,
        data,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        content: [],
        error: message,
      };
    }
  }

  /**
   * Get session context
   */
  getSessionContext() {
    return this.sessionManager.getSnapshot(this.sessionId);
  }

  /**
   * Clear session context
   */
  clearSession() {
    this.sessionManager.clear(this.sessionId, 'all');
  }

  /**
   * Get a session variable
   */
  getSessionVariable(key: string) {
    return this.sessionManager.getVariable(this.sessionId, key);
  }

  /**
   * Set a session variable
   */
  setSessionVariable(key: string, value: unknown) {
    return this.sessionManager.setVariable(this.sessionId, key, value);
  }
}

/**
 * Create a test client instance
 */
export async function createTestClient(sessionId?: string): Promise<TestMCPClient> {
  const client = new TestMCPClient(
    global.testConfig.lmAccount,
    global.testConfig.lmBearerToken,
    sessionId
  );
  
  await client.init();
  return client;
}

