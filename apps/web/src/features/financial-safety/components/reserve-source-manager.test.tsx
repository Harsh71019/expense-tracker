import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReserveSource, ReserveSourcePage, ReserveSummary } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { ReserveSourceManager } from "./reserve-source-manager";

const mocks = vi.hoisted(() => ({ GET: vi.fn(), PUT: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: mocks }));

const ASOF = new Date("2026-08-18T00:00:00.000Z");

function account(overrides: Partial<ReserveSource> = {}): ReserveSource {
  return {
    sourceKind: "account",
    sourceId: "11111111-1111-4111-8111-111111111111",
    displayName: "HDFC Savings",
    sourceType: "bank",
    configuration: {
      liquidityTier: "instant",
      isIncluded: true,
      eligibleCapMinor: null,
      effectiveFrom: ASOF,
      configuredAt: ASOF
    },
    currentValueMinor: 100_000,
    valuedAt: null,
    freshness: "not_applicable",
    eligibleMinor: 100_000,
    eligibility: "eligible",
    exclusionReason: "none",
    isUnavailable: false,
    lastUpdatedAt: ASOF,
    ...overrides
  };
}

const SUMMARY: ReserveSummary = {
  computedAt: ASOF,
  asOf: ASOF,
  sourceThrough: ASOF,
  formulaVersion: 1,
  policyVersion: 1,
  timezone: "Asia/Kolkata",
  configuredSourceCount: 1,
  currentlyEligibleSourceCount: 1,
  instantMinor: 100_000,
  tPlusOneMinor: 0,
  totalEligibleMinor: 100_000,
  lockedMinor: 0,
  staleExcludedMinor: 0,
  missingValueSourceCount: 0,
  staleSourceCount: 0,
  excludedSourceCount: 0,
  limitations: []
};

let mockSourcesHookReturn: {
  data: ReserveSourcePage | null | undefined;
  error: Error | null;
  isPending: boolean;
  refetch: () => Promise<void>;
};

vi.mock("../hooks/use-reserve-sources", () => ({
  useReserveSources: (initial: ReserveSourcePage | null) => ({
    ...mockSourcesHookReturn,
    data: mockSourcesHookReturn.data === undefined ? initial : mockSourcesHookReturn.data
  })
}));

vi.mock("../hooks/use-reserve-summary", () => ({
  useReserveSummary: () => ({ data: SUMMARY, error: null, isFetching: false, refetch: vi.fn() })
}));

vi.mock("../hooks/use-update-reserve-source", () => ({
  useUpdateReserveSource: () => ({
    mutateAsync: vi.fn().mockResolvedValue(account()),
    isPending: false,
    idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  })
}));

describe("ReserveSourceManager", () => {
  it("groups an eligible instant account into the instant access section", () => {
    mockSourcesHookReturn = {
      data: { items: [account()], pageInfo: { nextCursor: null, hasMore: false, limit: 200 } },
      error: null,
      isPending: false,
      refetch: vi.fn()
    };

    render(
      <ReserveSourceManager
        initialSources={mockSourcesHookReturn.data ?? null}
        initialSummary={SUMMARY}
      />
    );

    expect(screen.getByRole("heading", { name: "Instant access" })).toBeInTheDocument();
    expect(screen.getByText("HDFC Savings")).toBeInTheDocument();
    expect(screen.getByText("No sources classified as T+1 access yet.")).toBeInTheDocument();
  });

  it("shows an empty state when there are no candidates at all", () => {
    mockSourcesHookReturn = {
      data: { items: [], pageInfo: { nextCursor: null, hasMore: false, limit: 200 } },
      error: null,
      isPending: false,
      refetch: vi.fn()
    };

    render(
      <ReserveSourceManager
        initialSources={mockSourcesHookReturn.data ?? null}
        initialSummary={SUMMARY}
      />
    );
    expect(screen.getByText("No accounts or assets available yet")).toBeInTheDocument();
  });

  it("opens the classification sheet when a row's edit button is activated by keyboard", () => {
    mockSourcesHookReturn = {
      data: { items: [account()], pageInfo: { nextCursor: null, hasMore: false, limit: 200 } },
      error: null,
      isPending: false,
      refetch: vi.fn()
    };

    render(
      <ReserveSourceManager
        initialSources={mockSourcesHookReturn.data ?? null}
        initialSummary={SUMMARY}
      />
    );

    const editButton = screen.getByRole("button", { name: "Edit" });
    editButton.focus();
    expect(editButton).toHaveFocus();
    fireEvent.click(editButton);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/does not move or lock your money/i)).toBeInTheDocument();
  });

  it("shows a Load more button when the first page has more results, and fetches the next page", async () => {
    mocks.GET.mockReset().mockResolvedValueOnce({
      data: {
        items: [
          {
            ...account(),
            sourceId: "22222222-2222-4222-8222-222222222222",
            displayName: "Second Account"
          }
        ],
        pageInfo: { nextCursor: null, hasMore: false, limit: 50 }
      },
      error: undefined,
      response: { status: 200 }
    });

    mockSourcesHookReturn = {
      data: {
        items: [account()],
        pageInfo: { nextCursor: "opaque-cursor", hasMore: true, limit: 1 }
      },
      error: null,
      isPending: false,
      refetch: vi.fn()
    };

    render(
      <ReserveSourceManager
        initialSources={mockSourcesHookReturn.data ?? null}
        initialSummary={SUMMARY}
      />
    );

    const loadMoreButton = screen.getByRole("button", { name: /load more/i });
    fireEvent.click(loadMoreButton);

    await waitFor(() => expect(screen.getByText("Second Account")).toBeInTheDocument());
    expect(mocks.GET).toHaveBeenCalledWith("/v1/financial-safety/reserve-sources", {
      params: { query: { cursor: "opaque-cursor", limit: 50 } }
    });
  });

  it("renders a retry control on error with no data", () => {
    mockSourcesHookReturn = {
      data: null,
      error: new Error("network"),
      isPending: false,
      refetch: vi.fn()
    };

    render(<ReserveSourceManager initialSources={null} initialSummary={null} />);
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});
