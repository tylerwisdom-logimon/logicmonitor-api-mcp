/**
 * Global type definitions for tests
 */

declare global {
  var testConfig: {
    lmAccount: string;
    lmBearerToken: string;
    testResourcePrefix: string;
    cleanupOnFailure: boolean;
  };
}

export {};

