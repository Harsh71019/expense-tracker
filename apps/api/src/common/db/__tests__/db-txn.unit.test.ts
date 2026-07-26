import { describe, expect, it, vi } from "vitest";

import { withTxn } from "../db-txn.js";

describe("withTxn Unit Tests", () => {
  it("executes work callback successfully inside transaction", async () => {
    const mockDb = {
      transaction: vi.fn(async (cb: (tx: string) => Promise<unknown>) => cb("tx1"))
    };

    // @ts-expect-error mock db
    const res = await withTxn(mockDb, async (tx) => {
      expect(tx).toBe("tx1");
      return "success";
    });

    expect(res).toBe("success");
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
  });

  it("retries on serialization error 40001 up to 5 attempts", async () => {
    let attempts = 0;
    const mockDb = {
      transaction: vi.fn(async (cb: (tx: string) => Promise<unknown>) => {
        attempts++;
        if (attempts < 3) {
          const err = new Error("serialization failure");
          // @ts-expect-error adding postgres code
          err.code = "40001";
          throw err;
        }
        return cb("tx1");
      })
    };

    // @ts-expect-error mock db
    const res = await withTxn(mockDb, async () => "ok");

    expect(res).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("throws error after max 5 attempts on persistent deadlock 40P01", async () => {
    let attempts = 0;
    const mockDb = {
      transaction: vi.fn(async () => {
        attempts++;
        const err = new Error("deadlock detected");
        // @ts-expect-error adding postgres code
        err.code = "40P01";
        throw err;
      })
    };

    await expect(
      // @ts-expect-error mock db
      withTxn(mockDb, async () => "never")
    ).rejects.toThrow("deadlock detected");

    expect(attempts).toBe(5);
  });

  it("re-throws non-retryable errors immediately without retrying", async () => {
    let attempts = 0;
    const mockDb = {
      transaction: vi.fn(async () => {
        attempts++;
        throw new Error("unique constraint violation");
      })
    };

    await expect(
      // @ts-expect-error mock db
      withTxn(mockDb, async () => "never")
    ).rejects.toThrow("unique constraint violation");

    expect(attempts).toBe(1);
  });
});
