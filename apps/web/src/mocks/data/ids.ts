/**
 * Produces deterministic UUIDs for mock entities. `namespace` must contain no
 * more than eight hexadecimal characters; it keeps ids recognisable while
 * debugging (for example, all account ids start with "a0").
 */
export function createIdGenerator(namespace: string): () => string {
  let counter = 0;

  return function nextId(): string {
    counter += 1;
    const prefix = namespace.padEnd(8, "0");
    const suffix = counter.toString(16).padStart(12, "0");

    return `${prefix}-0000-4000-8000-${suffix}`;
  };
}
