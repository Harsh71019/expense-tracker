import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { IdempotencyPostgresService } from "../idempotency-postgres.service.js";

describe("IdempotencyPostgresService Unit Tests", () => {
  const DummySchema = z.object({ id: z.string(), value: z.number() });

  it("returns cached result if existing record found", async () => {
    const mockDb = {};
    const mockRepo = {
      find: vi.fn(async () => ({ result: { id: "res_1", value: 100 } })),
      record: vi.fn(async () => undefined)
    };

    // @ts-expect-error mock service args
    const service = new IdempotencyPostgresService(mockDb, mockRepo);

    const res = await service.execute("u1", "op1", "k1", DummySchema, async () => ({
      id: "res_2",
      value: 200
    }));

    expect(res.replayed).toBe(true);
    expect(res.result).toEqual({ id: "res_1", value: 100 });
  });

  it("executes work and records result on cache miss", async () => {
    const mockDb = {
      transaction: vi.fn(async (cb: (tx: string) => Promise<unknown>) => cb("tx1"))
    };
    const mockRepo = {
      find: vi.fn(async () => null),
      record: vi.fn(async () => undefined)
    };

    // @ts-expect-error mock service args
    const service = new IdempotencyPostgresService(mockDb, mockRepo);

    const work = vi.fn(async () => ({ id: "res_2", value: 200 }));

    const res = await service.execute("u1", "op1", "k2", DummySchema, work);

    expect(res.replayed).toBe(false);
    expect(res.result).toEqual({ id: "res_2", value: 200 });
    expect(mockRepo.record).toHaveBeenCalled();
  });
});
