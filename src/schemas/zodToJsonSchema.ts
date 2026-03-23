/**
 * Flattens a discriminated union JSON Schema for better MCP Inspector display.
 * Converts anyOf structures into flat object schemas with all parameters visible,
 * and generates an operation→parameter mapping so LLMs know which params apply to
 * which operation without needing full conditional schema support.
 */

/**
 * Extracts the discriminator value and non-discriminator param names from a branch.
 * Used to build the operation→parameter cheat sheet in the discriminator description.
 */
function extractBranchParams(
  branch: Record<string, unknown>,
  discriminatorField: string
): { opValue: string; params: string[] } | null {
  const props = branch.properties as Record<string, unknown> | undefined;
  if (!props) return null;

  const discriminatorProp = props[discriminatorField] as Record<string, unknown> | undefined;
  const opValue = discriminatorProp?.const as string | undefined;
  if (!opValue) return null;

  const required = (branch.required as string[] | undefined) ?? [];
  const params = Object.keys(props)
    .filter(k => k !== discriminatorField)
    .map(p => required.includes(p) ? `${p}(required)` : p);

  return { opValue, params };
}

/**
 * Builds a description string mapping each discriminator value to its parameters.
 * Example output: "list: filter, size, offset. get: id(required), fields. create: displayName, devices."
 */
function buildOperationParameterMap(
  anyOf: Array<Record<string, unknown>>,
  discriminatorField: string
): string {
  const segments: string[] = [];

  for (const branch of anyOf) {
    const nestedUnion = branch.anyOf ?? branch.oneOf;
    if (nestedUnion && Array.isArray(nestedUnion)) {
      // Nested union (e.g., update with multiple action types) — flatten
      for (const nested of nestedUnion as Array<Record<string, unknown>>) {
        const info = extractBranchParams(nested, discriminatorField);
        if (info) segments.push(`${info.opValue}: ${info.params.join(', ')}`);
      }
    } else {
      const info = extractBranchParams(branch, discriminatorField);
      if (info) segments.push(`${info.opValue}: ${info.params.join(', ')}`);
    }
  }

  return `The operation to perform. Parameters per operation: ${segments.join('. ')}.`;
}

/**
 * Flattens a JSON Schema that has anyOf at the root (discriminated union)
 * @param schema - JSON Schema with anyOf at root
 * @returns Flattened JSON Schema with all properties visible
 */
export function flattenDiscriminatedUnion(schema: Record<string, unknown>): Record<string, unknown> {
  // Zod v4 may produce oneOf instead of anyOf — normalize before processing
  let unionKey: 'anyOf' | 'oneOf' | null = null;
  if (schema.anyOf && Array.isArray(schema.anyOf)) {
    unionKey = 'anyOf';
  } else if (schema.oneOf && Array.isArray(schema.oneOf)) {
    unionKey = 'oneOf';
  }

  if (!unionKey) {
    return schema;
  }

  const anyOf = schema[unionKey] as Array<Record<string, unknown>>;

  // Find the discriminator field by looking at the first branch
  let discriminatorField = 'operation'; // default
  const firstBranch = anyOf[0];
  if (firstBranch.properties && typeof firstBranch.properties === 'object') {
    const props = firstBranch.properties as Record<string, unknown>;
    // Find the field with const value (discriminator)
    for (const [key, value] of Object.entries(props)) {
      if (typeof value === 'object' && value !== null && 'const' in value) {
        discriminatorField = key;
        break;
      }
    }
  }

  // Collect all unique properties and their schemas from all branches
  const allProperties: Record<string, unknown> = {};
  const discriminatorValues: string[] = [];
  const requiredFields = new Set<string>();

  // Helper function to process a branch (handles nested unions via anyOf or oneOf)
  const processBranch = (branch: Record<string, unknown>) => {
    // Check if this branch is itself a nested union (anyOf or oneOf)
    const nestedUnion = branch.anyOf ?? branch.oneOf;
    if (nestedUnion && Array.isArray(nestedUnion)) {
      for (const nestedBranch of nestedUnion as Array<Record<string, unknown>>) {
        processBranch(nestedBranch);
      }
      return;
    }

    if (branch.properties && typeof branch.properties === 'object') {
      const props = branch.properties as Record<string, unknown>;

      // Extract discriminator value
      const discriminatorProp = props[discriminatorField];
      if (typeof discriminatorProp === 'object' && discriminatorProp !== null && 'const' in discriminatorProp) {
        discriminatorValues.push(discriminatorProp.const as string);
      }

      // Merge all properties
      for (const [key, value] of Object.entries(props)) {
        if (key === discriminatorField) {
          // Handle discriminator specially - convert to enum
          continue;
        }

        if (allProperties[key]) {
          // Property exists in multiple branches - merge schemas
          const existing = allProperties[key] as Record<string, unknown>;
          const newSchema = value as Record<string, unknown>;

          // If schemas are different, use anyOf to combine them
          if (JSON.stringify(existing) !== JSON.stringify(newSchema)) {
            allProperties[key] = {
              anyOf: [
                ...(existing.anyOf ? (existing.anyOf as unknown[]) : [existing]),
                newSchema
              ]
            };
          }
        } else {
          // New property - add it
          allProperties[key] = value;
        }
      }

      // Track required fields from this branch
      if (branch.required && Array.isArray(branch.required)) {
        for (const field of branch.required) {
          if (field === discriminatorField) {
            requiredFields.add(field);
          }
        }
      }
    }
  };

  // Process all branches
  for (const branch of anyOf) {
    processBranch(branch);
  }

  // Create the discriminator property with enum and operation→parameter mapping.
  // The mapping gives LLMs a cheat sheet of which params apply to which operation,
  // compensating for the loss of conditional constraints during flattening.
  allProperties[discriminatorField] = {
    type: 'string',
    enum: Array.from(new Set(discriminatorValues)),
    description: buildOperationParameterMap(anyOf, discriminatorField)
  };

  // Build the flattened schema
  const flatSchema: Record<string, unknown> = {
    type: 'object',
    properties: allProperties,
    required: Array.from(requiredFields)
  };

  // Preserve other top-level properties from original schema
  for (const [key, value] of Object.entries(schema)) {
    if (key !== 'anyOf' && key !== 'oneOf' && key !== 'type' && key !== 'properties' && key !== 'required') {
      flatSchema[key] = value;
    }
  }

  return flatSchema;
}

