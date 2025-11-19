/**
 * Smoke test to verify test infrastructure
 */

describe('Test Infrastructure', () => {
  test('should have test configuration', () => {
    expect(global.testConfig).toBeDefined();
    expect(global.testConfig.testResourcePrefix).toBe('mcp-test');
  });

  test('should have environment variables', () => {
    // These might be empty in CI without secrets, but should be defined
    expect(typeof global.testConfig.lmAccount).toBe('string');
    expect(typeof global.testConfig.lmBearerToken).toBe('string');
  });

  test('basic assertions work', () => {
    expect(1 + 1).toBe(2);
    expect([1, 2, 3]).toHaveLength(3);
    expect({ a: 1 }).toHaveProperty('a');
  });
});

