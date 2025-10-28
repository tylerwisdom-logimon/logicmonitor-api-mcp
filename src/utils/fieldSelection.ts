export function parseFieldList(value?: string | null): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((field) => field.trim())
    .filter((field) => field.length > 0);
}

export function projectFields<T extends Record<string, unknown>>(
  item: T,
  fields: string[],
  fallbackFields: string[] = []
): Record<string, unknown> {
  const projected: Record<string, unknown> = {};

  if (fields.length > 0) {
    fields.forEach((field) => {
      if (field in item) {
        projected[field] = item[field];
      }
    });
  }

  if (fallbackFields.length > 0) {
    fallbackFields.forEach((field) => {
      if (!(field in projected) && field in item) {
        projected[field] = item[field];
      }
    });
  }

  return projected;
}

