import { BillDetailSchema, BillPageSchema } from "@treasury-ops/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getBillDetail } from "./get-bill-detail";
import { getBillPage } from "./get-bill-page";

const mocks = vi.hoisted(() => ({ GET: vi.fn(), debug: vi.fn() }));
vi.mock("@/lib/api/server", () => ({
  getServerApiClient: async () => ({ GET: mocks.GET })
}));
vi.mock("@/lib/debug", () => ({ debug: { api: mocks.debug } }));

const timestamp = new Date("2026-07-25T00:00:00.000Z");
const billId = "3fa85f64-5717-4562-b3fc-2c963f66be01";
const account = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66be02",
  userId: "user-1",
  name: "HDFC Card",
  type: "credit_card",
  currency: "INR",
  openingBalanceMinor: 0,
  balanceMinor: -10_000,
  isArchived: false,
  createdAt: timestamp,
  updatedAt: timestamp
};
const bill = {
  id: billId,
  userId: "user-1",
  accountId: account.id,
  cycleStart: new Date("2026-06-26T00:00:00.000Z"),
  cycleEnd: timestamp,
  dueDate: new Date("2026-08-15T00:00:00.000Z"),
  amountDueMinor: 10_000,
  reconciliationStatus: "awaiting_statement",
  paidMinor: 0,
  remainingMinor: 10_000,
  paymentStatus: "unpaid",
  createdAt: timestamp,
  updatedAt: timestamp
};
const page = BillPageSchema.parse({
  items: [bill],
  pageInfo: { nextCursor: null, hasMore: false, limit: 20 }
});
const detail = BillDetailSchema.parse({
  bill,
  account,
  reconciliation: {
    stats: { total: 0, matched: 0, missing: 0, ambiguous: 0, acknowledged: 0 },
    unresolved: 0,
    canReconcile: false,
    extraTransactions: []
  }
});

describe("bill server loaders", () => {
  beforeEach(() => {
    mocks.GET.mockReset();
    mocks.debug.mockReset();
  });

  it("loads and validates bill pages and details", async () => {
    mocks.GET.mockResolvedValueOnce({ data: page }).mockResolvedValueOnce({ data: detail });
    await expect(getBillPage({ paymentStatus: "unpaid", limit: 20 })).resolves.toEqual(page);
    await expect(getBillDetail(billId)).resolves.toEqual(detail);
    expect(mocks.GET).toHaveBeenCalledWith("/v1/bills", {
      params: { query: { paymentStatus: "unpaid", limit: 20 } }
    });
    expect(mocks.GET).toHaveBeenCalledWith("/v1/bills/{billId}", {
      params: { path: { billId } }
    });
  });

  it("fails closed for invalid ids and malformed list payloads", async () => {
    mocks.GET.mockResolvedValue({ data: { wrong: true } });
    await expect(getBillDetail("not-a-uuid")).resolves.toBeNull();
    await expect(getBillPage({ limit: 7 })).resolves.toEqual({
      items: [],
      pageInfo: { nextCursor: null, hasMore: false, limit: 7 }
    });
    expect(mocks.debug).toHaveBeenCalled();
  });
});
