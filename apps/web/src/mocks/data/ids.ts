/**
 * Produces ids matching the `^[a-f\d]{24}$/i` MongoDB ObjectId shape every
 * entity id is validated against. `namespace` must be hex-safe (0-9a-f) so
 * the generated id stays valid; it's just there to make ids readable while
 * debugging (e.g. all account ids start with "a0").
 */
export function createIdGenerator(namespace: string): () => string {
  let counter = 0;

  return function nextId(): string {
    counter += 1;
    return `${namespace}${counter.toString(16).padStart(24 - namespace.length, "0")}`;
  };
}
