import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SpendMix } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { SpendMixPanel } from "./spend-mix-panel";

const mocks = vi.hoisted(() => ({ useSpendMix: vi.fn() }));
vi.mock("../hooks/use-spend-mix", () => ({ useSpendMix: mocks.useSpendMix }));
vi.mock("@/features/reports/components/pie-chart", () => ({
  PieChart: () => <svg role="img" aria-label="pie" />
}));

const oneMonth: SpendMix = {
  range: "1M",
  totalMinor: 100,
  essential: { amountMinor: 60, pct: 60 },
  lifestyle: { amountMinor: 40, pct: 40 },
  uncategorized: { amountMinor: 0, pct: 0 }
};

describe("SpendMixPanel", () => {
  it("renders the essential/lifestyle legend, omitting an empty uncategorized bucket", () => {
    mocks.useSpendMix.mockReturnValue({ data: undefined });
    render(<SpendMixPanel initialSpendMix={oneMonth} initialRange="1M" />);

    expect(screen.getByText("Essentials")).toBeVisible();
    expect(screen.getByText("60% of spending")).toBeVisible();
    expect(screen.getByText("Lifestyle")).toBeVisible();
    expect(screen.queryByText("Uncategorized")).not.toBeInTheDocument();
  });

  it("shows the uncategorized bucket when it has spending", () => {
    mocks.useSpendMix.mockReturnValue({ data: undefined });
    render(
      <SpendMixPanel
        initialSpendMix={{
          ...oneMonth,
          uncategorized: { amountMinor: 10, pct: 10 }
        }}
        initialRange="1M"
      />
    );

    expect(screen.getByText("Uncategorized")).toBeVisible();
  });

  it("shows an empty state when there is no spending in range", () => {
    mocks.useSpendMix.mockReturnValue({ data: undefined });
    render(
      <SpendMixPanel
        initialSpendMix={{
          range: "1M",
          totalMinor: 0,
          essential: { amountMinor: 0, pct: 0 },
          lifestyle: { amountMinor: 0, pct: 0 },
          uncategorized: { amountMinor: 0, pct: 0 }
        }}
        initialRange="1M"
      />
    );

    expect(screen.getByText("No spending in this range.")).toBeVisible();
  });

  it("switches ranges on tab click", async () => {
    const user = userEvent.setup();
    mocks.useSpendMix.mockReturnValue({ data: undefined });
    render(<SpendMixPanel initialSpendMix={oneMonth} initialRange="1M" />);

    await user.click(screen.getByRole("button", { name: "6M" }));
    expect(mocks.useSpendMix).toHaveBeenLastCalledWith("6M", undefined);
  });
});
