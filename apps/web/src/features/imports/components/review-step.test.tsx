import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Category, StagedRow } from "@treasury-ops/shared";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReviewStep } from "./review-step";

const mocks = vi.hoisted(() => {
  const rows: StagedRow[] = [];
  return {
    rows,
    hasNextPage: false,
    isFetching: false,
    fetchNextPage: vi.fn(),
    updateMutate: vi.fn(),
    updatePending: false
  };
});

vi.mock("../hooks/use-staged-rows", () => ({
  useStagedRows: () => ({
    data: {
      pages: [{ items: mocks.rows, pageInfo: { nextCursor: null, hasMore: false, limit: 50 } }]
    },
    hasNextPage: mocks.hasNextPage,
    isFetching: mocks.isFetching,
    isFetchingNextPage: false,
    fetchNextPage: mocks.fetchNextPage
  })
}));

vi.mock("../hooks/use-update-staged-row", () => ({
  useUpdateStagedRow: () => ({ mutate: mocks.updateMutate, isPending: mocks.updatePending })
}));

const groceries: Category = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66beff",
  userId: "u1",
  name: "Groceries",
  kind: "expense",
  isArchived: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

function row(overrides: Partial<StagedRow> = {}): StagedRow {
  return {
    id: "3fa85f64-5717-4562-b3fc-2c963f66be31",
    batchId: "3fa85f64-5717-4562-b3fc-2c963f66be21",
    rowNumber: 1,
    raw: { Date: "01/07/2026" },
    parsed: {
      occurredAt: new Date("2026-07-01T00:00:00.000Z"),
      amountMinor: 45000,
      type: "expense",
      description: "SWIGGY*ORDER 4821"
    },
    problems: [],
    isDuplicate: false,
    include: true,
    ...overrides
  };
}

function wrapper({ children }: Readonly<{ children: ReactNode }>): ReactNode {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

describe("ReviewStep", () => {
  beforeEach(() => {
    mocks.rows = [];
    mocks.hasNextPage = false;
    mocks.isFetching = false;
    mocks.fetchNextPage.mockReset();
    mocks.updateMutate.mockReset();
    mocks.updatePending = false;
  });

  it("summarises totals, toggles include, and reports the included count", async () => {
    const user = userEvent.setup();
    mocks.rows = [
      row(),
      row({
        id: "3fa85f64-5717-4562-b3fc-2c963f66be32",
        rowNumber: 2,
        isDuplicate: true,
        parsed: {
          occurredAt: new Date("2026-07-09T00:00:00.000Z"),
          amountMinor: 64900,
          type: "expense",
          description: "NETFLIX.COM SUBSCRIPTION"
        }
      })
    ];
    const onCountsChange = vi.fn();
    render(<ReviewStep batchId="b1" categories={[groceries]} onCountsChange={onCountsChange} />, {
      wrapper
    });

    expect(screen.getByText("SWIGGY*ORDER 4821")).toBeVisible();
    expect(screen.getByText("Likely duplicate")).toBeVisible();
    expect(onCountsChange).toHaveBeenLastCalledWith(2);

    await user.click(screen.getByLabelText("Include row 1"));
    expect(mocks.updateMutate).toHaveBeenCalledWith({
      batchId: "b1",
      stagedRowId: mocks.rows[0]?.id,
      include: false
    });
  });

  it("disables the checkbox and category select for unparsed rows", () => {
    mocks.rows = [
      row({
        parsed: undefined,
        problems: ["Could not parse amount"],
        raw: { Date: "—", Narration: "MALFORMED ROW" }
      })
    ];
    render(<ReviewStep batchId="b1" categories={[groceries]} onCountsChange={vi.fn()} />, {
      wrapper
    });

    expect(screen.getByLabelText("Include row 1")).toBeDisabled();
    expect(screen.getByText("Could not parse amount", { exact: false })).toBeVisible();
  });

  it("updates the suggested category and clears the rule-suggested note once edited", async () => {
    const user = userEvent.setup();
    mocks.rows = [row({ suggestedCategoryId: groceries.id })];
    render(<ReviewStep batchId="b1" categories={[groceries]} onCountsChange={vi.fn()} />, {
      wrapper
    });

    expect(screen.getByText("✦ suggested by rule")).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Category for row 1"), "");
    expect(mocks.updateMutate).toHaveBeenCalledWith({
      batchId: "b1",
      stagedRowId: mocks.rows[0]?.id,
      suggestedCategoryId: null
    });
    expect(screen.queryByText("✦ suggested by rule")).not.toBeInTheDocument();
  });

  it("shows a Load more control when another page is available", async () => {
    const user = userEvent.setup();
    mocks.rows = [row()];
    mocks.hasNextPage = true;
    render(<ReviewStep batchId="b1" categories={[groceries]} onCountsChange={vi.fn()} />, {
      wrapper
    });

    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(mocks.fetchNextPage).toHaveBeenCalled();
  });
});
