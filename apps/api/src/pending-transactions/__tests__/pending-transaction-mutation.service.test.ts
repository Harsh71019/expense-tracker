import type { PendingTransaction } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { PendingTransactionMutationService } from "../pending-transaction-mutation.service.js";

const USER_ID = "u1";
const PENDING_ID = "123e4567-e89b-42d3-a456-426614174000";
const PENDING: PendingTransaction = {
  id: PENDING_ID,
  userId: USER_ID,
  accountId: "223e4567-e89b-42d3-a456-426614174000",
  type: "expense",
  occurredAt: new Date("2026-07-18T00:00:00.000Z"),
  description: "Anthropic — USD 23.60, INR amount pending",
  status: "pending",
  createdAt: new Date(),
  updatedAt: new Date()
};

describe("PendingTransactionMutationService", () => {
  it("executes create and dismiss callbacks through the idempotency service", async () => {
    const pending = {
      createInTx: vi.fn().mockResolvedValue(PENDING),
      dismissInTx: vi.fn().mockResolvedValue({ ...PENDING, status: "dismissed" })
    };
    const tx = {};
    const idempotency = {
      execute: vi.fn(
        async (
          _userId: string,
          _operation: string,
          _key: string,
          _intent: unknown,
          _schema: unknown,
          work: (value: object) => Promise<unknown>
        ) => ({ result: await work(tx), replayed: false })
      )
    };
    // @ts-expect-error - focused collaborators implement every exercised method.
    const service = new PendingTransactionMutationService(pending, idempotency);

    await service.create(
      USER_ID,
      {
        accountId: PENDING.accountId,
        type: "expense",
        occurredAt: PENDING.occurredAt,
        description: PENDING.description
      },
      "key-1"
    );
    await service.dismiss(USER_ID, PENDING_ID, "key-2");

    expect(pending.createInTx).toHaveBeenCalledWith(USER_ID, expect.anything(), tx);
    expect(pending.dismissInTx).toHaveBeenCalledWith(USER_ID, PENDING_ID, tx);
  });
});
