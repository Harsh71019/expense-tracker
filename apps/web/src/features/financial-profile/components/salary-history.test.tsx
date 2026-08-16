import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SalaryVersion } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { SalaryHistory } from "./salary-history";

const ASOF = new Date("2026-08-16T00:00:00.000Z");

function version(overrides: Partial<SalaryVersion> = {}): SalaryVersion {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "user-a",
    netMonthlySalaryMinor: 12_50_000,
    annualCtcMinor: null,
    effectiveFrom: new Date("2026-04-01T00:00:00.000Z"),
    source: "manually_confirmed",
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    ...overrides
  };
}

const CURRENT = version({
  id: "22222222-2222-4222-8222-222222222222",
  effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
  netMonthlySalaryMinor: 14_00_000
});
const FUTURE = version({
  id: "33333333-3333-4333-8333-333333333333",
  effectiveFrom: new Date("2026-12-01T00:00:00.000Z"),
  netMonthlySalaryMinor: 16_00_000
});
const SUPERSEDED = version();

describe("SalaryHistory", () => {
  it("renders versions newest first and labels each state in text", () => {
    render(
      <SalaryHistory
        versions={[FUTURE, CURRENT, SUPERSEDED]}
        currentVersionId={CURRENT.id}
        asOf={ASOF}
        onAddSalaryChange={vi.fn()}
      />
    );

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("₹16,000.00");
    expect(items[0]).toHaveTextContent("Takes effect later");
    expect(items[1]).toHaveTextContent("₹14,000.00");
    expect(items[1]).toHaveTextContent("Current");
    expect(items[2]).toHaveTextContent("₹12,500.00");
    expect(items[2]).toHaveTextContent("Superseded");
  });

  it("is read-only: no edit or delete affordance on any historical version", () => {
    render(
      <SalaryHistory
        versions={[CURRENT, SUPERSEDED]}
        currentVersionId={CURRENT.id}
        asOf={ASOF}
        onAddSalaryChange={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: /edit/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("marks an optional annual CTC as reference-only rather than income", () => {
    render(
      <SalaryHistory
        versions={[version({ annualCtcMinor: 2_40_00_000 })]}
        currentVersionId={SUPERSEDED.id}
        asOf={ASOF}
        onAddSalaryChange={vi.fn()}
      />
    );

    expect(screen.getByText(/Annual CTC ₹2,40,000.00/)).toBeVisible();
    expect(screen.getByText(/not\s+spendable income/)).toBeVisible();
  });

  it("offers add-salary-change from the empty state", async () => {
    const user = userEvent.setup();
    const onAddSalaryChange = vi.fn();
    render(
      <SalaryHistory
        versions={[]}
        currentVersionId={null}
        asOf={ASOF}
        onAddSalaryChange={onAddSalaryChange}
      />
    );

    expect(screen.getByText("No salary history yet")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Add salary change" }));
    expect(onAddSalaryChange).toHaveBeenCalledOnce();
  });

  it("shows a busy skeleton while history loads", () => {
    render(
      <SalaryHistory
        versions={[]}
        currentVersionId={null}
        asOf={ASOF}
        isLoading
        onAddSalaryChange={vi.fn()}
      />
    );

    expect(screen.getByRole("region", { name: "Salary history" })).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(screen.getByText("Loading salary history…")).toBeInTheDocument();
  });

  it("pages through earlier versions with the keyboard", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    render(
      <SalaryHistory
        versions={[CURRENT]}
        currentVersionId={CURRENT.id}
        asOf={ASOF}
        hasMore
        onLoadMore={onLoadMore}
        onAddSalaryChange={vi.fn()}
      />
    );

    const button = screen.getByRole("button", { name: "Show earlier versions" });
    button.focus();
    await user.keyboard("{Enter}");
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it("disables paging while a page is in flight", () => {
    render(
      <SalaryHistory
        versions={[CURRENT]}
        currentVersionId={CURRENT.id}
        asOf={ASOF}
        hasMore
        isFetchingMore
        onLoadMore={vi.fn()}
        onAddSalaryChange={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Loading…" })).toBeDisabled();
  });
});
