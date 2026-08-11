import type { PendingTransaction } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "../../auth/auth.guard.js";
import { PendingTransactionController } from "../pending-transaction.controller.js";

const PENDING_ID = "3fa85f64-5717-4562-b3fc-2c963f66beef";
const KEY = "10d11a9c-04ff-4e65-a22a-87b7f9681d98";
const USER: AuthenticatedUser = { id: "user-1" };
const PENDING: PendingTransaction = {
  id: PENDING_ID,
  userId: USER.id,
  accountId: "223e4567-e89b-42d3-a456-426614174000",
  type: "expense",
  occurredAt: new Date("2026-07-18T00:00:00.000Z"),
  description: "Anthropic — USD 23.60, INR amount pending",
  status: "pending",
  createdAt: new Date(),
  updatedAt: new Date()
};

function mockResponse() {
  const response = { status: vi.fn(), setHeader: vi.fn() };
  response.status.mockReturnValue(response);
  return response;
}

describe("PendingTransactionController", () => {
  it("creates a pending transaction through the idempotent mutation path", async () => {
    const pending = { list: vi.fn() };
    const mutations = {
      create: vi.fn().mockResolvedValue({ result: PENDING, replayed: false })
    };
    // @ts-expect-error - focused controller unit test uses service doubles.
    const controller = new PendingTransactionController(pending, mutations);
    const response = mockResponse();

    const body = {
      accountId: PENDING.accountId,
      type: "expense",
      occurredAt: PENDING.occurredAt,
      description: PENDING.description
    };
    const result = await controller.create(
      USER,
      body,
      KEY,
      // @ts-expect-error - focused response double implements the methods used by the controller.
      response
    );

    expect(result).toEqual(PENDING);
    expect(mutations.create).toHaveBeenCalledWith(USER.id, body, KEY);
    expect(response.setHeader).toHaveBeenCalledWith(
      "Location",
      `/api/v1/pending-transactions/${PENDING_ID}`
    );
  });

  it("defaults list filtering to pending status", async () => {
    const pending = { list: vi.fn().mockResolvedValue([PENDING]) };
    // @ts-expect-error - focused controller unit test uses service doubles.
    const controller = new PendingTransactionController(pending, {});

    await expect(controller.list(USER, {})).resolves.toEqual([PENDING]);
    expect(pending.list).toHaveBeenCalledWith(USER.id, "pending");
  });

  it("confirms a pending transaction with the supplied amount", async () => {
    const confirmed = { ...PENDING, status: "confirmed" as const, resultingTransactionId: "tx-1" };
    const pending = { confirm: vi.fn().mockResolvedValue(confirmed) };
    // @ts-expect-error - focused controller unit test uses service doubles.
    const controller = new PendingTransactionController(pending, {});

    await expect(
      controller.confirm(USER, PENDING_ID, { amountMinor: 199_900 }, KEY)
    ).resolves.toEqual(confirmed);
    expect(pending.confirm).toHaveBeenCalledWith(
      USER.id,
      PENDING_ID,
      { amountMinor: 199_900 },
      KEY
    );
  });

  it("marks replayed dismissals in the response", async () => {
    const mutations = {
      dismiss: vi
        .fn()
        .mockResolvedValue({ result: { ...PENDING, status: "dismissed" }, replayed: true })
    };
    // @ts-expect-error - focused controller unit test uses service doubles.
    const controller = new PendingTransactionController({}, mutations);
    const response = mockResponse();

    await controller.dismiss(
      USER,
      PENDING_ID,
      KEY,
      // @ts-expect-error - focused response double implements the methods used by the controller.
      response
    );

    expect(response.setHeader).toHaveBeenCalledWith("Idempotency-Replayed", "true");
  });
});
