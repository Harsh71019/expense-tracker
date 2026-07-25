import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  SpendingWarning,
  SpendingWarningAnalysis,
  SpendingWarningPage
} from "@treasury-ops/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SpendingWarningsPage } from "./spending-warnings-page";

type SpendingWarningsData = { pages: SpendingWarningPage[]; pageParams: Array<string | null> };

const mocks = vi.hoisted(
  (): {
    data: SpendingWarningsData | undefined;
    isError: boolean;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    isFetchNextPageError: boolean;
    fetchNextPage: ReturnType<typeof vi.fn>;
    refetch: ReturnType<typeof vi.fn>;
  } => ({
    data: undefined,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn()
  })
);

vi.mock("../hooks/use-spending-warnings", () => ({
  useSpendingWarnings: () => mocks
}));
vi.mock("../hooks/use-dismiss-spending-warning", () => ({
  useDismissSpendingWarning: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null
  })
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

function overallWarning(id: string): SpendingWarning {
  return {
    id,
    userId: "user-1",
    fingerprint: `v1:overall_spend_spike:${id}`,
    kind: "overall_spend_spike",
    severity: "attention",
    status: "active",
    windowStart: new Date("2026-07-17T00:00:00.000Z"),
    windowEnd: new Date("2026-07-24T00:00:00.000Z"),
    evidence: {
      kind: "overall_spend_spike",
      currentMinor: 1_240_000,
      baselineMedianMinor: 738_000,
      deltaMinor: 502_000,
      ratioBasisPoints: 16_802,
      windowStart: new Date("2026-07-17T00:00:00.000Z"),
      windowEnd: new Date("2026-07-24T00:00:00.000Z"),
      baselineWindowCount: 8,
      baselineExpenseCount: 46
    },
    detectorVersion: 1,
    firstDetectedAt: new Date("2026-07-24T02:00:00.000Z"),
    lastDetectedAt: new Date("2026-07-24T02:00:00.000Z")
  };
}

function pageWith(
  items: SpendingWarning[],
  analysis: SpendingWarningAnalysis
): SpendingWarningPage {
  return { items, pageInfo: { nextCursor: null, hasMore: false, limit: 20 }, analysis };
}

describe("SpendingWarningsPage", () => {
  beforeEach(() => {
    mocks.data = undefined;
    mocks.isError = false;
    mocks.hasNextPage = false;
    mocks.isFetchingNextPage = false;
    mocks.isFetchNextPageError = false;
    mocks.fetchNextPage.mockReset();
    mocks.refetch.mockReset();
  });

  it("shows the learning state with no warning list beneath it", () => {
    mocks.data = {
      pages: [pageWith([], { status: "learning", eligibleKinds: [], baselineExpenseCount: 3 })],
      pageParams: [null]
    };
    render(<SpendingWarningsPage filters={{ filter: "all" }} initialPage={null} />);

    expect(screen.getByRole("heading", { name: "Spending patterns" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Learning your patterns" })).toBeVisible();
    expect(screen.queryByText("No unusual spending patterns right now")).not.toBeInTheDocument();
  });

  it("shows the ready, no-warnings state", () => {
    mocks.data = {
      pages: [pageWith([], { status: "ready", eligibleKinds: [], baselineExpenseCount: 40 })],
      pageParams: [null]
    };
    render(<SpendingWarningsPage filters={{ filter: "all" }} initialPage={null} />);

    expect(screen.getByText("No unusual spending patterns right now")).toBeVisible();
  });

  it("shows warnings present with evidence and an investigation link", () => {
    mocks.data = {
      pages: [
        pageWith([overallWarning("w1")], {
          status: "ready",
          eligibleKinds: [],
          baselineExpenseCount: 40
        })
      ],
      pageParams: [null]
    };
    render(<SpendingWarningsPage filters={{ filter: "all" }} initialPage={null} />);

    expect(screen.getByRole("article", { name: "Overall spending spike" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Review transactions" })).toBeVisible();
  });

  it("shows the stale state while still rendering existing warnings", () => {
    mocks.data = {
      pages: [
        pageWith([overallWarning("w1")], {
          status: "stale",
          computedAt: new Date("2026-07-20T00:00:00.000Z"),
          eligibleKinds: [],
          baselineExpenseCount: 40
        })
      ],
      pageParams: [null]
    };
    render(<SpendingWarningsPage filters={{ filter: "all" }} initialPage={null} />);

    expect(screen.getByRole("heading", { name: "Analysis is delayed" })).toBeVisible();
    expect(screen.getByRole("article", { name: "Overall spending spike" })).toBeVisible();
  });

  it("shows a fetch-failure shell with a retry and no warning list", async () => {
    const user = userEvent.setup();
    mocks.isError = true;
    render(<SpendingWarningsPage filters={{ filter: "all" }} initialPage={null} />);

    expect(screen.getByRole("heading", { name: "Could not load spending patterns" })).toBeVisible();
    expect(screen.queryByText("No unusual spending patterns right now")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
  });

  it("shows the filtered-empty state when the selected filter hides every warning", () => {
    mocks.data = {
      pages: [
        pageWith([overallWarning("w1")], {
          status: "ready",
          eligibleKinds: [],
          baselineExpenseCount: 40
        })
      ],
      pageParams: [null]
    };
    render(<SpendingWarningsPage filters={{ filter: "large_expenses" }} initialPage={null} />);

    expect(screen.getByText("No spending patterns match this filter")).toBeVisible();
  });

  it("wires next-page loading and load-more through to the hook", async () => {
    const user = userEvent.setup();
    mocks.data = {
      pages: [
        pageWith([overallWarning("w1")], {
          status: "ready",
          eligibleKinds: [],
          baselineExpenseCount: 40
        })
      ],
      pageParams: [null]
    };
    mocks.hasNextPage = true;
    render(<SpendingWarningsPage filters={{ filter: "all" }} initialPage={null} />);

    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(mocks.fetchNextPage).toHaveBeenCalledOnce();
  });
});
