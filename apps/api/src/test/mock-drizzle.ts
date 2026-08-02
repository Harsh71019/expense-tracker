import { vi } from "vitest";

import type { DbTx } from "../common/db/db-txn.js";
import type { DrizzleDb } from "../common/db/db.module.js";

export type MockDrizzleDb = DrizzleDb & {
  readonly for: ReturnType<typeof vi.fn>;
  readonly values: ReturnType<typeof vi.fn>;
};

export function createMockDrizzleDb(defaultReturnRows: unknown[] = []): MockDrizzleDb {
  const chain: Record<string, unknown> = {};

  const methods = [
    "select",
    "selectDistinct",
    "from",
    "innerJoin",
    "leftJoin",
    "where",
    "orderBy",
    "groupBy",
    "limit",
    "offset",
    "for",
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

export function asMockDbTx(db: DrizzleDb): DbTx {
  // @ts-expect-error the fluent unit-test double implements the transaction methods under test
  return db;
}

export function focusedTestDouble<T>(value: unknown): T {
  // @ts-expect-error focused unit-test doubles intentionally implement only exercised behavior
  return value;
}
