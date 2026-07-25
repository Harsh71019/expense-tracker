import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { IdempotencyPostgresService } from "../idempotency-postgres.service.js";

const ResultSchema = z.object({ id: z.string() });

describe("IdempotencyPostgresService edge coverage", () => {
  it("returns a record found inside the transaction without executing work", async () => {
    const records = {
      find: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ result: { id: "concurrent" } }),
      record: vi.fn()
    };
    const db = {
      transaction: vi.fn(async (work: (value: object) => Promise<unknown>) => work({}))
    };
    // @ts-expect-error - focused collaborators implement the exercised methods.
    const service = new IdempotencyPostgresService(db, records);
    const work = vi.fn();

    await expect(service.execute("u1", "op", "key", ResultSchema, work)).resolves.toEqual({
      result: { id: "concurrent" },
      replayed: true
    });
    expect(work).not.toHaveBeenCalled();
  });

  it("serves a committed replay after the transaction fails", async () => {
    const failure = new Error("lost race");
    const records = {
      find: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ result: { id: "winner" } })
    };
    const db = {
      transaction: vi.fn(async (work: (value: object) => Promise<unknown>) => work({}))
    };
    // @ts-expect-error - focused collaborators implement the exercised methods.
    const service = new IdempotencyPostgresService(db, records);

    await expect(
      service.execute("u1", "op", "key", ResultSchema, async () => {
        throw failure;
      })
    ).resolves.toEqual({ result: { id: "winner" }, replayed: true });
  });

  it("rethrows after five replay checks find no committed winner", async () => {
    vi.useFakeTimers();
    const failure = new Error("genuine failure");
    const records = { find: vi.fn().mockResolvedValue(null) };
    const db = {
      transaction: vi.fn(async (work: (value: object) => Promise<unknown>) => work({}))
    };
    // @ts-expect-error - focused collaborators implement the exercised methods.
    const service = new IdempotencyPostgresService(db, records);

    const result = service.execute("u1", "op", "key", ResultSchema, async () => {
      throw failure;
    });
    const assertion = expect(result).rejects.toBe(failure);
    await vi.runAllTimersAsync();
    await assertion;
    expect(records.find).toHaveBeenCalledTimes(7);
    vi.useRealTimers();
  });
});
