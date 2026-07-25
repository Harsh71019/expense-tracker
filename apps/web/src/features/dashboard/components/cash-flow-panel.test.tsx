import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CashflowResponse } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { CashFlowPanel } from "./cash-flow-panel";

const mocks = vi.hoisted(() => ({ useCashflow: vi.fn() }));
vi.mock("../hooks/use-cashflow", () => ({ useCashflow: mocks.useCashflow }));

const sixMonth: CashflowResponse = {
  range: "6M",
  buckets: [{ label: "Jul", incomeMinor: 100, expenseMinor: 50 }]
};
const oneWeek: CashflowResponse = {
  range: "1W",
  buckets: [{ label: "Mon", incomeMinor: 0, expenseMinor: 10 }]
};

describe("CashFlowPanel", () => {
  it("renders the initial range's data and switches ranges on tab click", async () => {
    const user = userEvent.setup();
    mocks.useCashflow.mockImplementation((range: string) => ({
      data: range === "1W" ? oneWeek : undefined
    }));
    render(<CashFlowPanel initialCashflow={sixMonth} initialRange="6M" />);

    expect(screen.getByText("Jul")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "1W" }));
    expect(mocks.useCashflow).toHaveBeenLastCalledWith("1W", undefined);
    expect(screen.getByText("Mon")).toBeVisible();
  });
});
