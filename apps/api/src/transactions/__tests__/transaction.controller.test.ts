import { describe, expect, it, vi } from "vitest";
import { TransactionController } from "../transaction.controller.js";
import type { AuthenticatedUser } from "../../auth/auth.guard.js";

function mockResponse() {
  const response = {
    status: vi.fn(),
    setHeader: vi.fn()
  };
  response.status.mockReturnValue(response);
  return response;
}

const sampleTransaction = {
  id: "txn-1",
  userId: "user-1",
  accountId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
  type: "expense" as const,
  amountMinor: 250,
  currency: "INR" as const,
  occurredAt: new Date(),
  description: "Chai",
  tags: ["food"],
  source: "manual" as const,
  status: "posted" as const,
  createdAt: new Date(),
  updatedAt: new Date()
};

describe("TransactionController", () => {
  const user: AuthenticatedUser = { id: "user-1" };

  it("returns the bare transaction and sets Location on a fresh create", async () => {
    const mockService = {
      create: vi.fn().mockResolvedValue({ transaction: sampleTransaction, replayed: false })
    };
    // @ts-expect-error - mock TransactionService for unit testing
    const controller = new TransactionController(mockService);
    const body = {
      accountId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
      type: "expense",
      amountMinor: 250,
      occurredAt: "2026-07-12T09:00:00.000Z",
      description: "Chai",
      tags: ["food"]
    };
    const key = "10d11a9c-04ff-4e65-a22a-87b7f9681d98";
    const response = mockResponse();

    // @ts-expect-error - mock Response for unit testing
    const result = await controller.create(user, body, key, response);

    expect(result).toEqual(sampleTransaction);
    expect(response.setHeader).toHaveBeenCalledWith("Location", "/api/v1/transactions/txn-1");
    expect(response.status).not.toHaveBeenCalled();
    expect(mockService.create).toHaveBeenCalledWith(
      "user-1",
      {
        accountId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
        type: "expense",
        amountMinor: 250,
        occurredAt: new Date("2026-07-12T09:00:00.000Z"),
        description: "Chai",
        tags: ["food"]
      },
      "10d11a9c-04ff-4e65-a22a-87b7f9681d98"
    );
  });

  it("returns 200 with Idempotency-Replayed on a replayed create", async () => {
    const mockService = {
      create: vi.fn().mockResolvedValue({ transaction: sampleTransaction, replayed: true })
    };
    // @ts-expect-error - mock TransactionService for unit testing
    const controller = new TransactionController(mockService);
    const response = mockResponse();

    const result = await controller.create(
      user,
      {
        accountId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
        type: "expense",
        amountMinor: 250,
        occurredAt: "2026-07-12T09:00:00.000Z",
        description: "Chai",
        tags: ["food"]
      },
      "10d11a9c-04ff-4e65-a22a-87b7f9681d98",
      // @ts-expect-error - mock Response for unit testing
      response
    );

    expect(result).toEqual(sampleTransaction);
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.setHeader).toHaveBeenCalledWith("Idempotency-Replayed", "true");
  });

  it("returns the bare transaction from reverse", async () => {
    const mockService = {
      reverse: vi.fn().mockResolvedValue({ transaction: sampleTransaction, replayed: false })
    };
    // @ts-expect-error - mock TransactionService for unit testing
    const controller = new TransactionController(mockService);

    const result = await controller.reverse(user, "3fa85f64-5717-4562-b3fc-2c963f66beef");

    expect(result).toEqual(sampleTransaction);
    expect(mockService.reverse).toHaveBeenCalledWith(
      "user-1",
      "3fa85f64-5717-4562-b3fc-2c963f66beef"
    );
  });

  it("loads a transaction detail by validated id", async () => {
    const mockService = { get: vi.fn().mockResolvedValue(sampleTransaction) };
    // @ts-expect-error - mock TransactionService for unit testing
    const controller = new TransactionController(mockService);

    await expect(controller.get(user, "3fa85f64-5717-4562-b3fc-2c963f66beef")).resolves.toEqual(
      sampleTransaction
    );
    expect(mockService.get).toHaveBeenCalledWith("user-1", "3fa85f64-5717-4562-b3fc-2c963f66beef");
  });

  it("marks a natural reversal replay in the response header", async () => {
    const mockService = {
      reverse: vi.fn().mockResolvedValue({ transaction: sampleTransaction, replayed: true })
    };
    // @ts-expect-error - mock TransactionService for unit testing
    const controller = new TransactionController(mockService);
    const response = mockResponse();

    await controller.reverse(
      user,
      "3fa85f64-5717-4562-b3fc-2c963f66beef",
      // @ts-expect-error - mock Response for unit testing
      response
    );
    expect(response.setHeader).toHaveBeenCalledWith("Idempotency-Replayed", "true");
  });

  it("calls update on the transaction service with a validated patch", async () => {
    const updatedTransaction = { ...sampleTransaction, description: "Chai and biscuits" };
    const mockService = {
      update: vi.fn().mockResolvedValue(updatedTransaction)
    };

    // @ts-expect-error - mock TransactionService for unit testing
    const controller = new TransactionController(mockService);
    const result = await controller.update(user, "3fa85f64-5717-4562-b3fc-2c963f66beef", {
      description: "Chai and biscuits"
    });

    expect(result).toEqual(updatedTransaction);
    expect(mockService.update).toHaveBeenCalledWith(
      "user-1",
      "3fa85f64-5717-4562-b3fc-2c963f66beef",
      {
        description: "Chai and biscuits"
      }
    );
  });

  it("uses the replay-aware metadata mutation path", async () => {
    const updatedTransaction = { ...sampleTransaction, description: "Replay-safe edit" };
    const mockService = { update: vi.fn() };
    const mockMutations = {
      update: vi.fn().mockResolvedValue({ result: updatedTransaction, replayed: true })
    };
    // @ts-expect-error - mock services for unit testing
    const controller = new TransactionController(mockService, mockMutations);
    const response = mockResponse();

    const result = await controller.update(
      user,
      "3fa85f64-5717-4562-b3fc-2c963f66beef",
      { description: "Replay-safe edit" },
      "16161616-aaaa-4161-8161-161616161616",
      // @ts-expect-error - mock Response for unit testing
      response
    );

    expect(result).toEqual(updatedTransaction);
    expect(mockMutations.update).toHaveBeenCalledWith(
      "user-1",
      "3fa85f64-5717-4562-b3fc-2c963f66beef",
      { description: "Replay-safe edit" },
      "16161616-aaaa-4161-8161-161616161616"
    );
    expect(response.setHeader).toHaveBeenCalledWith("Idempotency-Replayed", "true");
  });

  it("calls list on the transaction service with validated query params", async () => {
    const mockPage = { items: [], pageInfo: { nextCursor: null, hasMore: false, limit: 10 } };
    const mockService = {
      list: vi.fn().mockResolvedValue(mockPage)
    };

    // @ts-expect-error - mock TransactionService for unit testing
    const controller = new TransactionController(mockService);
    const query = {
      accountId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
      q: "chai",
      limit: "10"
    };

    const result = await controller.list(user, query);
    expect(result).toEqual(mockPage);
    expect(mockService.list).toHaveBeenCalledWith("user-1", {
      accountId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
      q: "chai",
      limit: 10
    });
  });

  it("applies the list limit default and rejects an out-of-range limit", async () => {
    const mockService = { list: vi.fn().mockResolvedValue({ items: [], pageInfo: {} }) };

    // @ts-expect-error - mock TransactionService for unit testing
    const controller = new TransactionController(mockService);

    await controller.list(user, {});
    expect(mockService.list).toHaveBeenCalledWith("user-1", { limit: 50 });
    expect(() => controller.list(user, { limit: "101" })).toThrow();
    expect(mockService.list).toHaveBeenCalledTimes(1);
  });

  it("rejects attempts to patch immutable ledger fields", async () => {
    const mockService = { update: vi.fn() };

    // @ts-expect-error - mock TransactionService for unit testing
    const controller = new TransactionController(mockService);

    await expect(
      controller.update(user, "3fa85f64-5717-4562-b3fc-2c963f66beef", { amountMinor: 100 })
    ).rejects.toThrow();
    await expect(
      controller.update(user, "3fa85f64-5717-4562-b3fc-2c963f66beef", { type: "income" })
    ).rejects.toThrow();
    expect(mockService.update).not.toHaveBeenCalled();
  });

  it("rejects a malformed idempotency key before calling the service", async () => {
    const mockService = { create: vi.fn() };
    // @ts-expect-error - mock TransactionService for unit testing
    const controller = new TransactionController(mockService);
    const response = mockResponse();

    await expect(
      controller.create(
        user,
        {
          accountId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
          type: "expense",
          amountMinor: 250,
          occurredAt: "2026-07-12T09:00:00.000Z",
          description: "Chai"
        },
        "not-a-uuid",
        // @ts-expect-error - mock Response for unit testing
        response
      )
    ).rejects.toThrow();
    expect(mockService.create).not.toHaveBeenCalled();
  });

  it("rejects a missing create idempotency key before calling the service", async () => {
    const mockService = { create: vi.fn() };
    // @ts-expect-error - mock TransactionService for unit testing
    const controller = new TransactionController(mockService);
    const response = mockResponse();

    await expect(
      controller.create(
        user,
        {
          accountId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
          type: "expense",
          amountMinor: 250,
          occurredAt: "2026-07-12T09:00:00.000Z",
          description: "Chai"
        },
        undefined,
        // @ts-expect-error - mock Response for unit testing
        response
      )
    ).rejects.toThrow();
    expect(mockService.create).not.toHaveBeenCalled();
  });
});
