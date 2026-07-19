import { describe, expect, it, vi } from "vitest";
import { TransferController } from "../transfer.controller.js";
import type { AuthenticatedUser } from "../../auth/auth.guard.js";

function mockResponse() {
  const response = {
    status: vi.fn(),
    setHeader: vi.fn()
  };
  response.status.mockReturnValue(response);
  return response;
}

describe("TransferController", () => {
  const user: AuthenticatedUser = { id: "user-1" };

  it("returns the bare transfer and sets Location on a fresh create", async () => {
    const mockResult = {
      transferGroupId: "3fa85f64-5717-4562-b3fc-2c963f66be99",
      fromTransaction: { id: "txn-from" },
      toTransaction: { id: "txn-to" },
      replayed: false
    };
    const mockService = { create: vi.fn().mockResolvedValue(mockResult) };

    // @ts-expect-error - mock TransferService for unit testing
    const controller = new TransferController(mockService);
    const body = {
      fromAccountId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
      toAccountId: "3fa85f64-5717-4562-b3fc-2c963f66beff",
      amountMinor: 10_000,
      occurredAt: "2026-07-12T09:00:00.000Z",
      description: "ATM withdrawal"
    };
    const key = "10d11a9c-04ff-4e65-a22a-87b7f9681d98";
    const response = mockResponse();

    // @ts-expect-error - mock Response for unit testing
    const result = await controller.create(user, body, key, response);

    expect(result).toEqual({
      transferGroupId: "3fa85f64-5717-4562-b3fc-2c963f66be99",
      fromTransaction: { id: "txn-from" },
      toTransaction: { id: "txn-to" }
    });
    expect(response.setHeader).toHaveBeenCalledWith("Location", "/api/v1/transactions/txn-from");
    expect(response.status).not.toHaveBeenCalled();
    expect(mockService.create).toHaveBeenCalledWith(
      "user-1",
      {
        fromAccountId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
        toAccountId: "3fa85f64-5717-4562-b3fc-2c963f66beff",
        amountMinor: 10_000,
        occurredAt: new Date("2026-07-12T09:00:00.000Z"),
        description: "ATM withdrawal",
        tags: []
      },
      "10d11a9c-04ff-4e65-a22a-87b7f9681d98"
    );
  });

  it("returns 200 with Idempotency-Replayed on a replayed create", async () => {
    const mockResult = {
      transferGroupId: "3fa85f64-5717-4562-b3fc-2c963f66be99",
      fromTransaction: { id: "txn-from" },
      toTransaction: { id: "txn-to" },
      replayed: true
    };
    const mockService = { create: vi.fn().mockResolvedValue(mockResult) };
    // @ts-expect-error - mock TransferService for unit testing
    const controller = new TransferController(mockService);
    const response = mockResponse();

    const result = await controller.create(
      user,
      {
        fromAccountId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
        toAccountId: "3fa85f64-5717-4562-b3fc-2c963f66beff",
        amountMinor: 10_000,
        occurredAt: "2026-07-12T09:00:00.000Z",
        description: "ATM withdrawal"
      },
      "10d11a9c-04ff-4e65-a22a-87b7f9681d98",
      // @ts-expect-error - mock Response for unit testing
      response
    );

    expect(result).toEqual({
      transferGroupId: "3fa85f64-5717-4562-b3fc-2c963f66be99",
      fromTransaction: { id: "txn-from" },
      toTransaction: { id: "txn-to" }
    });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.setHeader).toHaveBeenCalledWith("Idempotency-Replayed", "true");
  });

  it("returns the bare transfer reversal", async () => {
    const mockResult = {
      transferGroupId: "3fa85f64-5717-4562-b3fc-2c963f66be99",
      legs: [{ id: "txn-a" }, { id: "txn-b" }],
      replayed: false
    };
    const mockService = { reverse: vi.fn().mockResolvedValue(mockResult) };

    // @ts-expect-error - mock TransferService for unit testing
    const controller = new TransferController(mockService);
    const result = await controller.reverse(user, "3fa85f64-5717-4562-b3fc-2c963f66be99");

    expect(result).toEqual({
      transferGroupId: "3fa85f64-5717-4562-b3fc-2c963f66be99",
      legs: [{ id: "txn-a" }, { id: "txn-b" }]
    });
    expect(mockService.reverse).toHaveBeenCalledWith(
      "user-1",
      "3fa85f64-5717-4562-b3fc-2c963f66be99"
    );
  });

  it("marks a natural group-reversal replay in the response header", async () => {
    const mockResult = {
      transferGroupId: "3fa85f64-5717-4562-b3fc-2c963f66be99",
      legs: [{ id: "txn-a" }, { id: "txn-b" }],
      replayed: true
    };
    const mockService = { reverse: vi.fn().mockResolvedValue(mockResult) };
    // @ts-expect-error - mock TransferService for unit testing
    const controller = new TransferController(mockService);
    const response = mockResponse();

    await controller.reverse(
      user,
      "3fa85f64-5717-4562-b3fc-2c963f66be99",
      // @ts-expect-error - mock Response for unit testing
      response
    );

    expect(response.setHeader).toHaveBeenCalledWith("Idempotency-Replayed", "true");
  });

  it("rejects a transfer between the same account before calling the service", async () => {
    const mockService = { create: vi.fn() };
    // @ts-expect-error - mock TransferService for unit testing
    const controller = new TransferController(mockService);
    const response = mockResponse();

    await expect(
      controller.create(
        user,
        {
          fromAccountId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
          toAccountId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
          amountMinor: 10_000,
          occurredAt: "2026-07-12T09:00:00.000Z",
          description: "Self transfer"
        },
        "10d11a9c-04ff-4e65-a22a-87b7f9681d98",
        // @ts-expect-error - mock Response for unit testing
        response
      )
    ).rejects.toThrow();
    expect(mockService.create).not.toHaveBeenCalled();
  });

  it("rejects a malformed idempotency key before calling the service", async () => {
    const mockService = { create: vi.fn() };
    // @ts-expect-error - mock TransferService for unit testing
    const controller = new TransferController(mockService);
    const response = mockResponse();

    await expect(
      controller.create(
        user,
        {
          fromAccountId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
          toAccountId: "3fa85f64-5717-4562-b3fc-2c963f66beff",
          amountMinor: 10_000,
          occurredAt: "2026-07-12T09:00:00.000Z",
          description: "ATM withdrawal"
        },
        "not-a-uuid",
        // @ts-expect-error - mock Response for unit testing
        response
      )
    ).rejects.toThrow();
    expect(mockService.create).not.toHaveBeenCalled();
  });

  it("rejects a missing idempotency key before calling the service", async () => {
    const mockService = { create: vi.fn() };
    // @ts-expect-error - mock TransferService for unit testing
    const controller = new TransferController(mockService);
    const response = mockResponse();

    await expect(
      controller.create(
        user,
        {
          fromAccountId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
          toAccountId: "3fa85f64-5717-4562-b3fc-2c963f66beff",
          amountMinor: 10_000,
          occurredAt: "2026-07-12T09:00:00.000Z",
          description: "ATM withdrawal"
        },
        undefined,
        // @ts-expect-error - mock Response for unit testing
        response
      )
    ).rejects.toThrow();
    expect(mockService.create).not.toHaveBeenCalled();
  });
});
