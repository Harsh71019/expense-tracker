/**
 * Converts every `null` value in a flat object to `undefined`. Drizzle
 * returns `null` for an empty nullable column; shared zod schemas' optional
 * fields (modeled on Mongo, where an absent field is simply not present in
 * the document) only accept `undefined`, not `null`. Every repository
 * mapper that parses a Drizzle row through a shared schema needs this
 * conversion first, or `.parse()` throws on any row with a null column.
 */
export function stripNulls<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    result[key] = val === null ? undefined : val;
  }
  return result;
}
