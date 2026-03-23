export function parseFieldList(value?: string | null): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((field) => field.trim())
    .filter((field) => field.length > 0);
}


