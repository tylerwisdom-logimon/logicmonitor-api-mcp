/**
 * Unit tests for flattenDiscriminatedUnion
 * Pure unit tests — no network access or LM credentials required.
 */

import { flattenDiscriminatedUnion } from '../../../src/schemas/zodToJsonSchema.js';

describe('flattenDiscriminatedUnion', () => {
  // ── passthrough when no anyOf ────────────────────────────────────

  it('returns schema unchanged if no anyOf present', () => {
    const schema = {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    };
    const result = flattenDiscriminatedUnion(schema);
    expect(result).toEqual(schema);
  });

  // ── simple 2-branch union ────────────────────────────────────────

  it('flattens a simple discriminated union with 2 branches', () => {
    const schema = {
      anyOf: [
        {
          type: 'object',
          properties: {
            operation: { const: 'list' },
            filter: { type: 'string' },
          },
          required: ['operation'],
        },
        {
          type: 'object',
          properties: {
            operation: { const: 'get' },
            id: { type: 'number' },
          },
          required: ['operation', 'id'],
        },
      ],
    };

    const result = flattenDiscriminatedUnion(schema);

    expect(result.type).toBe('object');
    expect(result.anyOf).toBeUndefined();

    const props = result.properties as Record<string, any>;
    expect(props.operation.type).toBe('string');
    expect(props.operation.enum).toEqual(['list', 'get']);
    expect(props.filter).toEqual({ type: 'string' });
    expect(props.id).toEqual({ type: 'number' });
  });

  // ── collects all properties from all branches ────────────────────

  it('collects all properties from all branches', () => {
    const schema = {
      anyOf: [
        {
          type: 'object',
          properties: {
            op: { const: 'create' },
            name: { type: 'string' },
            description: { type: 'string' },
          },
          required: ['op', 'name'],
        },
        {
          type: 'object',
          properties: {
            op: { const: 'delete' },
            id: { type: 'number' },
          },
          required: ['op', 'id'],
        },
        {
          type: 'object',
          properties: {
            op: { const: 'list' },
            filter: { type: 'string' },
            size: { type: 'number' },
          },
          required: ['op'],
        },
      ],
    };

    const result = flattenDiscriminatedUnion(schema);
    const props = result.properties as Record<string, any>;

    // All non-discriminator properties should be present
    expect(props.name).toBeDefined();
    expect(props.description).toBeDefined();
    expect(props.id).toBeDefined();
    expect(props.filter).toBeDefined();
    expect(props.size).toBeDefined();
  });

  // ── enum from discriminator values ───────────────────────────────

  it('creates enum from discriminator values', () => {
    const schema = {
      anyOf: [
        {
          type: 'object',
          properties: { operation: { const: 'list' } },
          required: ['operation'],
        },
        {
          type: 'object',
          properties: { operation: { const: 'get' } },
          required: ['operation'],
        },
        {
          type: 'object',
          properties: { operation: { const: 'create' } },
          required: ['operation'],
        },
      ],
    };

    const result = flattenDiscriminatedUnion(schema);
    const opProp = (result.properties as Record<string, any>).operation;

    expect(opProp.type).toBe('string');
    expect(opProp.enum).toEqual(['list', 'get', 'create']);
  });

  // ── operation-parameter mapping in description ───────────────────

  it('generates operation-parameter mapping in description', () => {
    const schema = {
      anyOf: [
        {
          type: 'object',
          properties: {
            operation: { const: 'list' },
            filter: { type: 'string' },
            size: { type: 'number' },
          },
          required: ['operation'],
        },
        {
          type: 'object',
          properties: {
            operation: { const: 'get' },
            id: { type: 'number' },
          },
          required: ['operation', 'id'],
        },
      ],
    };

    const result = flattenDiscriminatedUnion(schema);
    const opProp = (result.properties as Record<string, any>).operation;

    expect(opProp.description).toContain('Parameters per operation');
    expect(opProp.description).toContain('list: filter, size');
    expect(opProp.description).toContain('get: id(required)');
  });

  // ── nested anyOf (e.g., update with multiple action types) ───────

  it('handles nested anyOf (e.g., update with multiple action types)', () => {
    const schema = {
      anyOf: [
        {
          type: 'object',
          properties: {
            operation: { const: 'list' },
            filter: { type: 'string' },
          },
          required: ['operation'],
        },
        {
          // This branch is itself a union (nested anyOf)
          anyOf: [
            {
              type: 'object',
              properties: {
                operation: { const: 'update' },
                id: { type: 'number' },
                name: { type: 'string' },
              },
              required: ['operation', 'id'],
            },
            {
              type: 'object',
              properties: {
                operation: { const: 'patch' },
                id: { type: 'number' },
                fields: { type: 'object' },
              },
              required: ['operation', 'id'],
            },
          ],
        },
      ],
    };

    const result = flattenDiscriminatedUnion(schema);
    const props = result.properties as Record<string, any>;

    // All values from top-level and nested branches should be collected
    expect(props.operation.enum).toContain('list');
    expect(props.operation.enum).toContain('update');
    expect(props.operation.enum).toContain('patch');

    // Properties from nested branches should be present
    expect(props.filter).toBeDefined();
    expect(props.id).toBeDefined();
    expect(props.name).toBeDefined();
    expect(props.fields).toBeDefined();
  });

  // ── preserves other top-level schema properties ──────────────────

  it('preserves other top-level schema properties', () => {
    const schema = {
      anyOf: [
        {
          type: 'object',
          properties: { operation: { const: 'list' } },
          required: ['operation'],
        },
      ],
      description: 'Tool schema',
      $schema: 'http://json-schema.org/draft-07/schema#',
      additionalProperties: false,
    };

    const result = flattenDiscriminatedUnion(schema);

    expect(result.description).toBe('Tool schema');
    expect(result.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(result.additionalProperties).toBe(false);
    // anyOf should be removed
    expect(result.anyOf).toBeUndefined();
  });

  // ── deduplicates discriminator values ────────────────────────────

  it('deduplicates discriminator values', () => {
    // Contrived: two branches with the same const value
    const schema = {
      anyOf: [
        {
          type: 'object',
          properties: {
            operation: { const: 'list' },
            filter: { type: 'string' },
          },
          required: ['operation'],
        },
        {
          // Nested branch that also produces "list"
          anyOf: [
            {
              type: 'object',
              properties: {
                operation: { const: 'list' },
                size: { type: 'number' },
              },
              required: ['operation'],
            },
          ],
        },
      ],
    };

    const result = flattenDiscriminatedUnion(schema);
    const opProp = (result.properties as Record<string, any>).operation;

    // "list" should only appear once in the enum
    expect(opProp.enum.filter((v: string) => v === 'list')).toHaveLength(1);
  });

  // ── merges differing schemas for the same property with anyOf ────

  it('merges differing schemas for the same property using anyOf', () => {
    const schema = {
      anyOf: [
        {
          type: 'object',
          properties: {
            operation: { const: 'a' },
            value: { type: 'string' },
          },
          required: ['operation'],
        },
        {
          type: 'object',
          properties: {
            operation: { const: 'b' },
            value: { type: 'number' },
          },
          required: ['operation'],
        },
      ],
    };

    const result = flattenDiscriminatedUnion(schema);
    const valueProp = (result.properties as Record<string, any>).value;

    // Should have an anyOf combining both schemas
    expect(valueProp.anyOf).toBeDefined();
    expect(valueProp.anyOf).toContainEqual({ type: 'string' });
    expect(valueProp.anyOf).toContainEqual({ type: 'number' });
  });
});
