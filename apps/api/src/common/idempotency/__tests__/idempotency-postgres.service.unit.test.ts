import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { IdempotencyConflictError } from "../../errors/idempotency-conflict.error.js";
import { fingerprintRequest, IdempotencyPostgresService } from "../idempotency-postgres.service.js";

describe("IdempotencyPostgresService Unit Tests", () => {
  const DummySchema = z.object({ id: z.string(), value: z.number() });

  it("returns cached result if existing record found", async () => {
    const mockDb = {};
    const mockRepo = {
      deleteExpired: vi.fn(async () => undefined),
      find: vi.fn(async () => ({
        requestFingerprint: fingerprintRequest({ amount: 100 }),
        result: { id: "res_1", value: 100 }
      })),
      record: vi.fn(async () => undefined)
    };

    // @ts-expect-error mock service args
    const service = new IdempotencyPostgresService(mockDb, mockRepo);

    const res = await service.execute(
      "u1",
      "op1",
      "k1",
      { amount: 100 },
      DummySchema,
      async () => ({
        id: "res_2",
        value: 200
      })
    );

    expect(res.replayed).toBe(true);
    expect(res.result).toEqual({ id: "res_1", value: 100 });
  });

  it("executes work and records result on cache miss", async () => {
    const mockDb = {
      transaction: vi.fn(async (cb: (tx: string) => Promise<unknown>) => cb("tx1"))
    };
    const mockRepo = {
      deleteExpired: vi.fn(async () => undefined),
      find: vi.fn(async () => null),
      record: vi.fn(async () => undefined)
    };

    // @ts-expect-error mock service args
    const service = new IdempotencyPostgresService(mockDb, mockRepo);

    const work = vi.fn(async () => ({ id: "res_2", value: 200 }));

    const res = await service.execute("u1", "op1", "k2", { amount: 200 }, DummySchema, work);

    expect(res.replayed).toBe(false);
    expect(res.result).toEqual({ id: "res_2", value: 200 });
    expect(mockRepo.record).toHaveBeenCalledWith(
      "u1",
      "op1",
      "k2",
      fingerprintRequest({ amount: 200 }),
      { id: "res_2", value: 200 },
      "tx1"
    );
    expect(mockRepo.deleteExpired).toHaveBeenCalledOnce();
  });

  it("rejects a key reused for different request data", async () => {
    const mockRepo = {
      deleteExpired: vi.fn(async () => undefined),
      find: vi.fn(async () => ({
        requestFingerprint: fingerprintRequest({ amount: 100 }),
        result: { id: "res_1", value: 100 }
      })),
      record: vi.fn(async () => undefined)
    };
    // @ts-expect-error mock service args
    const service = new IdempotencyPostgresService({}, mockRepo);

    await expect(
      service.execute("u1", "op1", "k1", { amount: 200 }, DummySchema, async () => ({
        id: "res_2",
        value: 200
      }))
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it("fingerprints semantically identical object key order consistently", () => {
    expect(fingerprintRequest({ nested: { b: 2, a: 1 }, name: "x" })).toBe(
      fingerprintRequest({ name: "x", nested: { a: 1, b: 2 } })
    );
  });
});
