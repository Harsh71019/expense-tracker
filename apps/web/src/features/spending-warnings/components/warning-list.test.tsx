import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SpendingWarning } from "@treasury-ops/shared";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { WarningList } from "./warning-list";

vi.mock("../hooks/use-dismiss-spending-warning", () => ({
  useDismissSpendingWarning: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null
  })
}));

vi.mock("./warning-card", () => ({
  WarningCard: ({
    warning: item,
    onDismissed
  }: Readonly<{
    warning: { id: string };
    onDismissed: (warningId: string, message: string) => void;
  }>): ReactNode => (
    <div>
      <span>card:{item.id}</span>
      <button
        type="button"
        onClick={() => onDismissed(item.id, "Marked not useful for this period.")}
      >
        Not useful for this period ({item.id})
      </button>
    </div>
  )
}));

function baseFields(id: string, kind: SpendingWarning["kind"]) {
  return {
    id,
    userId: "user-1",
    fingerprint: `v1:${kind}:${id}`,
    severity: "attention" as const,
    status: "active" as const,
    windowStart: new Date("2026-07-17T00:00:00.000Z"),
    windowEnd: new Date("2026-07-24T00:00:00.000Z"),
    detectorVersion: 1,
    firstDetectedAt: new Date("2026-07-24T02:00:00.000Z"),
    lastDetectedAt: new Date("2026-07-24T02:00:00.000Z")
  };
}

function warning(id: string, kind: SpendingWarning["kind"]): SpendingWarning {
  if (kind === "unusually_large_expense") {
    return {
      ...baseFields(id, kind),
      kind,
      evidence: {
        kind,
        transactionId: "3fa85f64-5717-4562-b3fc-2c963f66bd01",
        amountMinor: 950_000,
        thresholdMinor: 500_000,
        baselineMedianMinor: 180_000,
        baselineQ1Minor: 120_000,
        baselineQ3Minor: 250_000,
        baselineExpenseCount: 18,
        occurredAt: new Date("2026-07-24T00:00:00.000Z")
      }
    };
  }
  if (kind === "category_spend_spike") {
    return {
      ...baseFields(id, kind),
      kind,
      evidence: {
        kind,
        currentMinor: 1_240_000,
        baselineMedianMinor: 738_000,
        deltaMinor: 502_000,
        ratioBasisPoints: 16_802,
        windowStart: new Date("2026-07-17T00:00:00.000Z"),
        windowEnd: new Date("2026-07-24T00:00:00.000Z"),
        baselineWindowCount: 8,
        baselineExpenseCount: 46,
        currentExpenseCount: 9
      }
    };
  }
  return {
    ...baseFields(id, kind),
    kind,
    evidence: {
      kind,
      currentMinor: 1_240_000,
      baselineMedianMinor: 738_000,
      deltaMinor: 502_000,
      ratioBasisPoints: 16_802,
      windowStart: new Date("2026-07-17T00:00:00.000Z"),
      windowEnd: new Date("2026-07-24T00:00:00.000Z"),
      baselineWindowCount: 8,
      baselineExpenseCount: 46
    }
  };
}

describe("WarningList", () => {
  it("renders warnings as a semantic list of articles", () => {
    render(
      <WarningList
        items={[warning("w1", "overall_spend_spike")]}
        filter="all"
        analysisStatus="ready"
        hasNextPage={false}
        isFetchingNextPage={false}
        hasNextPageError={false}
        onLoadMore={vi.fn()}
      />
    );

    expect(screen.getByRole("list")).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("card:w1")).toBeVisible();
  });

  it("shows the no-warnings empty state when ready with zero items and no filter", () => {
    render(
      <WarningList
        items={[]}
        filter="all"
        analysisStatus="ready"
        hasNextPage={false}
        isFetchingNextPage={false}
        hasNextPageError={false}
        onLoadMore={vi.fn()}
      />
    );
    expect(screen.getByText("No unusual spending patterns right now")).toBeVisible();
  });

  it("shows the filtered empty state when a filter hides everything", () => {
    render(
      <WarningList
        items={[]}
        filter="large_expenses"
        analysisStatus="ready"
        hasNextPage={false}
        isFetchingNextPage={false}
        hasNextPageError={false}
        onLoadMore={vi.fn()}
      />
    );
    expect(screen.getByText("No spending patterns match this filter")).toBeVisible();
  });

  it("renders nothing extra while still learning with zero items", () => {
    const { container } = render(
      <WarningList
        items={[]}
        filter="all"
        analysisStatus="learning"
        hasNextPage={false}
        isFetchingNextPage={false}
        hasNextPageError={false}
        onLoadMore={vi.fn()}
      />
    );
    expect(screen.queryByText("No unusual spending patterns right now")).not.toBeInTheDocument();
    expect(container.querySelector("ul")).toBeNull();
  });

  it("shows a load-more control and a next-page error message", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    render(
      <WarningList
        items={[warning("w1", "overall_spend_spike")]}
        filter="all"
        analysisStatus="ready"
        hasNextPage
        isFetchingNextPage={false}
        hasNextPageError
        onLoadMore={onLoadMore}
      />
    );

    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(onLoadMore).toHaveBeenCalledOnce();
    expect(screen.getByText("Could not load more spending patterns.")).toBeVisible();
  });

  it("disables load-more while fetching the next page", () => {
    render(
      <WarningList
        items={[warning("w1", "overall_spend_spike")]}
        filter="all"
        analysisStatus="ready"
        hasNextPage
        isFetchingNextPage
        hasNextPageError={false}
        onLoadMore={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Loading…" })).toBeDisabled();
  });

  it("does not duplicate or reorder cards across two loaded pages", () => {
    render(
      <WarningList
        items={[
          warning("w1", "overall_spend_spike"),
          warning("w2", "category_spend_spike"),
          warning("w3", "unusually_large_expense")
        ]}
        filter="all"
        analysisStatus="ready"
        hasNextPage={false}
        isFetchingNextPage={false}
        hasNextPageError={false}
        onLoadMore={vi.fn()}
      />
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("card:w1")).toBeVisible();
    expect(screen.getByText("card:w2")).toBeVisible();
    expect(screen.getByText("card:w3")).toBeVisible();
  });

  it("removes a card and announces the result on a successful dismiss", async () => {
    const user = userEvent.setup();
    render(
      <WarningList
        items={[warning("w1", "overall_spend_spike"), warning("w2", "category_spend_spike")]}
        filter="all"
        analysisStatus="ready"
        hasNextPage={false}
        isFetchingNextPage={false}
        hasNextPageError={false}
        onLoadMore={vi.fn()}
      />
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Not useful for this period (w1)" }));

    expect(screen.queryByText("card:w1")).not.toBeInTheDocument();
    expect(screen.getByText("card:w2")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Marked not useful for this period.");
  });
});
