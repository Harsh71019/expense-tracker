import { vi } from "vitest";

import type { DrizzleDb } from "../common/db/db.module.js";

export function createMockDrizzleDb(defaultReturnRows: unknown[] = []): DrizzleDb {
  const chain: Record<string, unknown> = {};

  const methods = [
    "select",
    "selectDistinct",
    "from",
    "where",
    "orderBy",
    "groupBy",
    "limit",
    "offset",
    "insert",
    "values",
    "returning",
    "update",
    "set",
    "delete",
    "execute",
    "onConflictDoUpdate",
    "onConflictDoNothing"
  ];

  for (const method of methods) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }

  chain.then = (
    onfulfilled?: (value: unknown) => unknown,
    onrejected?: (reason: unknown) => unknown
  ) => Promise.resolve(defaultReturnRows).then(onfulfilled, onrejected);

  // @ts-expect-error mock db implementation for unit tests
  return chain;
}
