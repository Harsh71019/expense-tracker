import type { Receivable, ReceivableMutationResult } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "../../auth/auth.guard.js";
import { ReceivableController } from "../receivable.controller.js";

const RECEIVABLE_ID = "3fa85f64-5717-4562-b3fc-2c963f66beef";
const KEY = "10d11a9c-04ff-4e65-a22a-87b7f9681d98";
const USER: AuthenticatedUser = { id: "user-1" };

const RECEIVABLE: Receivable = {
  id: RECEIVABLE_ID,
  counterpartyName: "Rohan",
  openedAt: new Date(),
  outstandingMinor: 10_000_00,
  confirmedRepaidMinor: 0,
  repaymentCount: 0,
  status: "active",
  isMigrated: false,
  createdAt: new Date(),
  updatedAt: new Date()
};

const MUTATION_RESULT: ReceivableMutationResult = {
  receivable: RECEIVABLE,
  event: {
    id: "event-1",
    receivableId: RECEIVABLE_ID,
    kind: "opening",
    amountMinor: 10_000_00,
    occurredAt: new Date(),
    isReversed: false,
    createdAt: new Date()
  }
};

function mockResponse() {
  const response = { status: vi.fn(), setHeader: vi.fn() };
  response.status.mockReturnValue(response);
  return response;
}

describe("ReceivableController", () => {
  it("validates and creates a receivable through the idempotent mutation path", async () => {
    const mutations = {
      create: vi.fn().mockResolvedValue({ result: MUTATION_RESULT, replayed: false })
    };
    // @ts-expect-error - focused controller unit test uses service doubles.
    const controller = new ReceivableController({}, mutations);
    const response = mockResponse();

    const body = {
      fundingMode: "opening_balance",
      counterpartyName: "Rohan",
      outstandingMinor: 10_000_00,
      openedAt: new Date().toISOString()
    };

    const result = await controller.create(
      USER,
      body,
      KEY,
      // @ts-expect-error - focused response double implements the methods used by the controller.
      response
    );

    expect(result).toEqual(MUTATION_RESULT);
    expect(mutations.create).toHaveBeenCalledWith(
      USER.id,
      expect.objectContaining({
        fundingMode: "opening_balance",
        counterpartyName: "Rohan",
        outstandingMinor: 10_000_00,
        openedAt: expect.any(Date)
      }),
      KEY
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      "Location",
      `/api/v1/receivables/${RECEIVABLE_ID}`
    );
  });

  it("rejects a body that does not match either creation mode", async () => {
    const mutations = { create: vi.fn() };
    // @ts-expect-error - focused controller unit test uses service doubles.
    const controller = new ReceivableController({}, mutations);
    const response = mockResponse();

    await expect(
      controller.create(
        USER,
        { counterpartyName: "Rohan" },
        KEY,
        // @ts-expect-error - focused response double implements the methods used by the controller.
        response
      )
    ).rejects.toThrow();
    expect(mutations.create).not.toHaveBeenCalled();
  });

  it("rejects a missing idempotency key on create", async () => {
    const mutations = { create: vi.fn() };
    // @ts-expect-error - focused controller unit test uses service doubles.
    const controller = new ReceivableController({}, mutations);
    const response = mockResponse();

    await expect(
      controller.create(
        USER,
        {
          fundingMode: "opening_balance",
          counterpartyName: "Rohan",
          outstandingMinor: 10_000_00,
          openedAt: new Date().toISOString()
        },
        undefined,
        // @ts-expect-error - focused response double implements the methods used by the controller.
        response
      )
    ).rejects.toThrow();
    expect(mutations.create).not.toHaveBeenCalled();
  });

  it("marks a replayed repayment in the response and never sets Location", async () => {
    const mutations = {
      recordRepayment: vi.fn().mockResolvedValue({ result: MUTATION_RESULT, replayed: true })
    };
    // @ts-expect-error - focused controller unit test uses service doubles.
    const controller = new ReceivableController({}, mutations);
    const response = mockResponse();

    const result = await controller.recordRepayment(
      USER,
      RECEIVABLE_ID,
      {
        captureMode: "receive_now",
        accountId: "5b2e6e2e-9f0e-4a1a-8f2e-9c9c9c9c9c9c",
        amountMinor: 2_500_00,
        occurredAt: new Date().toISOString(),
        description: "Repayment from Rohan"
      },
      KEY,
      // @ts-expect-error - focused response double implements the methods used by the controller.
      response
    );

    expect(result).toEqual(MUTATION_RESULT);
    expect(response.setHeader).toHaveBeenCalledWith("Idempotency-Replayed", "true");
    expect(response.setHeader).not.toHaveBeenCalledWith("Location", expect.anything());
  });

  it("parses list query params and delegates to the service", async () => {
    const service = {
      list: vi.fn().mockResolvedValue({ items: [], pageInfo: { hasMore: false, limit: 50 } })
    };
    // @ts-expect-error - focused controller unit test uses service doubles.
    const controller = new ReceivableController(service, {});

    await controller.list(USER, { status: "active" });
    expect(service.list).toHaveBeenCalledWith(
      USER.id,
      expect.objectContaining({ status: "active" })
    );
  });

  it("rejects an invalid status filter", async () => {
    const service = { list: vi.fn() };
    // @ts-expect-error - focused controller unit test uses service doubles.
    const controller = new ReceivableController(service, {});

    expect(() => controller.list(USER, { status: "not-a-status" })).toThrow();
    expect(service.list).not.toHaveBeenCalled();
  });

  it("creates a correction through the idempotent mutation path", async () => {
    const mutations = {
      createCorrection: vi.fn().mockResolvedValue({ result: MUTATION_RESULT, replayed: false })
    };
    // @ts-expect-error - focused controller unit test uses service doubles.
    const controller = new ReceivableController({}, mutations);
    const response = mockResponse();

    const body = { direction: "decrease", amountMinor: 500_00, reason: "Rounding fix" };
    const result = await controller.createCorrection(
      USER,
      RECEIVABLE_ID,
      body,
      KEY,
      // @ts-expect-error - focused response double implements the methods used by the controller.
      response
    );

    expect(result).toEqual(MUTATION_RESULT);
    expect(mutations.createCorrection).toHaveBeenCalledWith(USER.id, RECEIVABLE_ID, body, KEY);
  });

  it("rejects a correction with no reason", async () => {
    const mutations = { createCorrection: vi.fn() };
    // @ts-expect-error - focused controller unit test uses service doubles.
    const controller = new ReceivableController({}, mutations);
    const response = mockResponse();

    await expect(
      controller.createCorrection(
        USER,
        RECEIVABLE_ID,
        { direction: "decrease", amountMinor: 500_00 },
        KEY,
        // @ts-expect-error - focused response double implements the methods used by the controller.
        response
      )
    ).rejects.toThrow();
    expect(mutations.createCorrection).not.toHaveBeenCalled();
  });
});
