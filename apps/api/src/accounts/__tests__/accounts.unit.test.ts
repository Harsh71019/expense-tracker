import { describe, expect, it, vi } from "vitest";

import { EntityNotFoundError } from "../../common/errors/entity-not-found.error.js";
import { createMockDrizzleDb } from "../../test/mock-drizzle.js";
import { AccountMutationService } from "../account-mutation.service.js";
import { AccountService } from "../account.service.js";

describe("Account Services Unit Tests", () => {
  const sampleAccount = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    userId: "u1",
    name: "Savings",
    type: "bank" as const,
    balanceMinor: 10000,
    currency: "INR" as const,
    isArchived: false,
    openingBalanceMinor: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  describe("AccountService", () => {
    it("list returns non-archived accounts", async () => {
      const mockDb = createMockDrizzleDb([sampleAccount]);
      const mockRepo = {
        list: vi.fn(async () => [sampleAccount])
      };
      // @ts-expect-error mock service args
      const service = new AccountService(mockDb, mockRepo);

      const res = await service.list("u1");
      expect(res).toHaveLength(1);
      expect(res[0]?.name).toBe("Savings");
    });

    it("returns owned account details and delegates the selected insights range", async () => {
      const mockDb = createMockDrizzleDb();
      const mockRepo = {
        findById: vi.fn().mockResolvedValue(sampleAccount)
      };
      const mockInsights = {
        get: vi.fn().mockResolvedValue({ range: "1y" })
      };
      // @ts-expect-error focused service doubles
      const service = new AccountService(mockDb, mockRepo, mockInsights);

      await expect(service.get("u1", sampleAccount.id)).resolves.toBe(sampleAccount);
      await expect(service.getInsights("u1", sampleAccount.id, "1y")).resolves.toEqual({
        range: "1y"
      });
      expect(mockInsights.get).toHaveBeenCalledWith(
        "u1",
        sampleAccount,
        expect.objectContaining({ range: "1y", bucket: "month" })
      );
    });

    it("does not resolve a missing or foreign account", async () => {
      const mockDb = createMockDrizzleDb();
      const mockRepo = { findById: vi.fn().mockResolvedValue(null) };
      // @ts-expect-error focused service doubles
      const service = new AccountService(mockDb, mockRepo, { get: vi.fn() });

      await expect(service.get("u2", sampleAccount.id)).rejects.toBeInstanceOf(EntityNotFoundError);
    });
  });

  describe("AccountMutationService", () => {
    it("create delegates to idempotency service", async () => {
      const mockRepo = { create: vi.fn(async () => sampleAccount) };
      const mockIdempotency = {
        execute: vi.fn(async (_userId, _op, _key, _intent, _schema, work) => {
          const res = await work({});
          return { result: res, replayed: false };
        })
      };

      // @ts-expect-error mock service args
      const service = new AccountMutationService(mockRepo, mockIdempotency);

      mockIdempotency.execute.mockResolvedValueOnce({
        result: sampleAccount,
        replayed: false
      });

      const res = await service.create(
        "u1",
        { name: "Savings", type: "bank", openingBalanceMinor: 0 },
        "key1"
      );

      expect(res.result.name).toBe("Savings");
    });

    it("archive delegates to idempotency service", async () => {
      const mockRepo = { archive: vi.fn(async () => true) };
      const mockIdempotency = {
        execute: vi.fn(async (_userId, _op, _key, _intent, _schema, work) => {
          await work({});
          return { result: null, replayed: false };
        })
      };

      // @ts-expect-error mock service args
      const service = new AccountMutationService(mockRepo, mockIdempotency);

      const res = await service.archive("u1", sampleAccount.id, "key1");
      expect(res.result).toBeNull();
    });
  });
});
