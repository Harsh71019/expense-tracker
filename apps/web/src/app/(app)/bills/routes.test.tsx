import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import BillDetailPage from "./[billId]/page";
import BillsPage from "./page";

const mocks = vi.hoisted(() => ({
  accounts: [],
  page: { items: [], pageInfo: { nextCursor: null, hasMore: false, limit: 50 } },
  detail: { bill: { id: "3fa85f64-5717-4562-b3fc-2c963f66be01" } }
}));

vi.mock("@/features/accounts/server/get-accounts", () => ({
  getAccounts: async () => mocks.accounts
}));
vi.mock("@/features/bills/server/get-bill-page", () => ({
  getBillPage: async () => mocks.page
}));
vi.mock("@/features/bills/server/get-bill-detail", () => ({
  getBillDetail: async () => mocks.detail
}));
vi.mock("@/features/bills", () => ({
  BillList: () => <h1>Credit card bills</h1>,
  BillDetail: () => <h1>Statement bill</h1>
}));

describe("bill route shells", () => {
  it("renders the server-loaded list and detail routes", async () => {
    render(await BillsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading", { name: "Credit card bills" })).toBeVisible();

    render(
      await BillDetailPage({
        params: Promise.resolve({ billId: mocks.detail.bill.id })
      })
    );
    expect(screen.getByRole("heading", { name: "Statement bill" })).toBeVisible();
  });
});
