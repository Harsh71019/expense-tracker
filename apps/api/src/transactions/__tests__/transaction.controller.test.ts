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
    const request = { authMethod: "session" as const };

    // @ts-expect-error - mock Request/Response for unit testing
    const result = await controller.create(user, body, key, request, response);

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
      "10d11a9c-04ff-4e65-a22a-87b7f9681d98",
      "manual"
    );
  });

  it('stamps source "api" when the request was authenticated via an API key', async () => {
    const mockService = {
      create: vi.fn().mockResolvedValue({ transaction: sampleTransaction, replayed: false })
    };
    // @ts-expect-error - mock TransactionService for unit testing
    const controller = new TransactionController(mockService);
    const response = mockResponse();
    const request = { authMethod: "api-key" as const };

    await controller.create(
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
      // @ts-expect-error - mock Request/Response for unit testing
      request,
      response
    );

    expect(mockService.create).toHaveBeenCalledWith(
      "user-1",
      expect.anything(),
      "10d11a9c-04ff-4e65-a22a-87b7f9681d98",
      "api"
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
      // @ts-expect-error - mock Request/Response for unit testing
      { authMethod: "session" },
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

  it("updates metadata through the replay-aware mutation service", async () => {
    const updatedTransaction = { ...sampleTransaction, description: "Chai and biscuits" };
    const mockService = {};
    const mockMutations = {
      update: vi.fn().mockResolvedValue({ result: updatedTransaction, replayed: false })
    };

    // @ts-expect-error - mock TransactionService for unit testing
    const controller = new TransactionController(mockService, mockMutations);
    const result = await controller.update(
      user,
      "3fa85f64-5717-4562-b3fc-2c963f66beef",
      { description: "Chai and biscuits" },
      "17171717-aaaa-4171-8171-171717171717"
    );

    expect(result).toEqual(updatedTransaction);
    expect(mockMutations.update).toHaveBeenCalledWith(
      "user-1",
      "3fa85f64-5717-4562-b3fc-2c963f66beef",
      {
        description: "Chai and biscuits"
      },
      "17171717-aaaa-4171-8171-171717171717"
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

  it("assigns a category to a validated transaction batch", async () => {
    const input = {
      transactionIds: ["3fa85f64-5717-4562-b3fc-2c963f66beef"],
      categoryId: "3fa85f64-5717-4562-b3fc-2c963f66be99"
    };
    const batchResult = { ...input, updatedCount: 1 };
    const mockMutations = {
      assignCategory: vi.fn().mockResolvedValue({ result: batchResult, replayed: true })
    };
    // @ts-expect-error - focused controller collaborators
    const controller = new TransactionController({}, mockMutations);
    const response = mockResponse();

    await expect(
      controller.assignCategory(
        user,
        input,
        "18181818-aaaa-4181-8181-181818181818",
        // @ts-expect-error - mock Response for unit testing
        response
      )
    ).resolves.toEqual(batchResult);
    expect(mockMutations.assignCategory).toHaveBeenCalledWith(
      "user-1",
      input,
      "18181818-aaaa-4181-8181-181818181818"
    );
    expect(response.setHeader).toHaveBeenCalledWith("Idempotency-Replayed", "true");
  });

  it("rejects an invalid category batch before invoking the mutation service", async () => {
    const mockMutations = { assignCategory: vi.fn() };
    // @ts-expect-error - focused controller collaborators
    const controller = new TransactionController({}, mockMutations);

    await expect(
      controller.assignCategory(
        user,
        { transactionIds: [], categoryId: "not-a-category" },
        "18181818-aaaa-4181-8181-181818181818",
        // @ts-expect-error - response is unused when validation fails
        mockResponse()
      )
    ).rejects.toThrow();
    expect(mockMutations.assignCategory).not.toHaveBeenCalled();
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
        // @ts-expect-error - mock Request/Response for unit testing
        { authMethod: "session" },
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
        // @ts-expect-error - mock Request/Response for unit testing
        { authMethod: "session" },
        response
      )
    ).rejects.toThrow();
    expect(mockService.create).not.toHaveBeenCalled();
  });
});
