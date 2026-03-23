/**
 * Bearer token authentication
 * Tokens are stored as SHA-256 hashes for defense-in-depth.
 */

import { createHash } from 'crypto';
import type { AuthValidator, AuthResult } from './types.js';
import type { CredentialMapper } from './credentialMapper.js';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class BearerAuthValidator implements AuthValidator {
  private validTokenHashes: Set<string>;
  /** Maps token hash → original token for credential mapper lookups */
  private tokenHashToRaw: Map<string, string>;

  constructor(
    tokens: string[],
    private credentialMapper: CredentialMapper
  ) {
    this.validTokenHashes = new Set(tokens.map(hashToken));
    this.tokenHashToRaw = new Map(tokens.map(t => [hashToken(t), t]));
  }

  async validate(token: string): Promise<AuthResult> {
    const tokenHash = hashToken(token);

    if (!this.validTokenHashes.has(tokenHash)) {
      return {
        success: false,
        error: 'Invalid bearer token',
      };
    }

    // Token is valid - get credentials from mapping (if available)
    // Note: credentials can also be provided via X-LM-Account and X-LM-Bearer-Token headers
    // which are handled by the middleware, so we don't fail if mapping is missing
    const rawToken = this.tokenHashToRaw.get(tokenHash) ?? token;
    const credentials = this.credentialMapper.getCredentials(rawToken);

    return {
      success: true,
      clientId: tokenHash,
      credentials,
    };
  }
}

