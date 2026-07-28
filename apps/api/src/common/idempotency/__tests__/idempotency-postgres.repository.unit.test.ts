import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createMockDrizzleDb } from "../../../test/mock-drizzle.js";
import { IdempotencyPostgresRepository } from "../idempotency-postgres.repository.js";

describe("IdempotencyPostgresRepository Unit Tests", () => {
  const sampleRow = {
    userId: "u1",
    operation: "test_op",
    key: "key_123",
    requestFingerprint: "fingerprint",
    result: { ok: true, id: "res_1" },
    createdAt: new Date()
  };

  const DummySchema = z.object({ ok: z.boolean(), id: z.string() });

  it("find returns parsed record when row exists", async () => {
    const mockDb = createMockDrizzleDb([sampleRow]);
    const repo = new IdempotencyPostgresRepository(mockDb);

    const res = await repo.find("u1", "test_op", "key_123", DummySchema);
    expect(res?.requestFingerprint).toBe("fingerprint");
    expect(res?.result).toEqual({ ok: true, id: "res_1" });
  });

  it("find returns null when no row exists", async () => {
    const mockDb = createMockDrizzleDb([]);
    const repo = new IdempotencyPostgresRepository(mockDb);

    const res = await repo.find("u1", "test_op", "non_existent", DummySchema);
    expect(res).toBeNull();
  });

  it("record inserts response JSON", async () => {
    const mockDb = createMockDrizzleDb([sampleRow]);
    const repo = new IdempotencyPostgresRepository(mockDb);

    await repo.record(
      "u1",
      "test_op",
      "key_123",
      "fingerprint",
      { ok: true, id: "res_1" },
      // @ts-expect-error mock tx
      mockDb
    );
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it("deletes only the user's expired records", async () => {
    const mockDb = createMockDrizzleDb();
    const repo = new IdempotencyPostgresRepository(mockDb);

    await repo.deleteExpired("u1", new Date("2026-06-01T00:00:00.000Z"));

    expect(mockDb.delete).toHaveBeenCalled();
  });
});
