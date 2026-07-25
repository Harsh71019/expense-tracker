import { render, screen } from "@testing-library/react";
import type { CashflowBucket } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { CashFlowChart } from "./cash-flow-chart";

const buckets: CashflowBucket[] = [
  { label: "Jun", incomeMinor: 850_000_00, expenseMinor: 684_250_00 },
  { label: "Jul", incomeMinor: 920_000_00, expenseMinor: 618_425_00 }
];

describe("CashFlowChart", () => {
  it("renders a labeled chart with a tick per bucket", () => {
    render(<CashFlowChart buckets={buckets} />);

    expect(screen.getByRole("img", { name: "Income versus spending over time" })).toBeVisible();
    expect(screen.getByText("Jun")).toBeVisible();
    expect(screen.getByText("Jul")).toBeVisible();
  });

  it("shows an empty message when there is no data", () => {
    render(<CashFlowChart buckets={[]} />);
    expect(screen.getByText("No cash flow data yet.")).toBeVisible();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
