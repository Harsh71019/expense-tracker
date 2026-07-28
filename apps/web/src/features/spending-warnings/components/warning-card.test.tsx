import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SpendingWarning } from "@treasury-ops/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WarningCard } from "./warning-card";

const mocks = vi.hoisted(
  (): {
    mutate: ReturnType<typeof vi.fn>;
    isPending: boolean;
    isError: boolean;
    error: Error | null;
  } => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null
  })
);

vi.mock("../hooks/use-dismiss-spending-warning", () => ({
  useDismissSpendingWarning: () => ({
    mutate: mocks.mutate,
    isPending: mocks.isPending,
    isError: mocks.isError,
    error: mocks.error
  })
}));

const warning: SpendingWarning = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66be01",
  userId: "user-1",
  fingerprint: "v1:overall_spend_spike:2026-07-20",
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

describe("WarningCard", () => {
  beforeEach(() => {
    mocks.mutate.mockReset();
    mocks.isPending = false;
    mocks.isError = false;
    mocks.error = null;
  });

  it("renders as a labeled article with severity text, not just color", () => {
    render(<WarningCard warning={warning} onDismissed={vi.fn()} />);

    const article = screen.getByRole("article", { name: "Overall spending spike" });
    expect(article).toBeVisible();
    expect(screen.getByText("Needs attention")).toBeVisible();
    expect(screen.getByRole("link", { name: "Review transactions" })).toHaveAttribute(
      "href",
      "/transactions?from=2026-07-17T00%3A00%3A00.000Z&to=2026-07-24T00%3A00%3A00.000Z"
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("disables the dismiss control while pending", () => {
    mocks.isPending = true;
    render(<WarningCard warning={warning} onDismissed={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Dismissing…" })).toBeDisabled();
  });

  it("calls onDismissed with a message on a successful dismiss", async () => {
    const user = userEvent.setup();
    const onDismissed = vi.fn();
    mocks.mutate.mockImplementation(
      (_warningId: string, options?: { onSuccess?: () => void }): void => {
        options?.onSuccess?.();
      }
    );
    render(<WarningCard warning={warning} onDismissed={onDismissed} />);

    await user.click(screen.getByRole("button", { name: "Not useful for this period" }));

    expect(mocks.mutate).toHaveBeenCalledWith(warning.id, expect.objectContaining({}));
    expect(onDismissed).toHaveBeenCalledWith(
      warning.id,
      "Marked not useful for this period. A later pattern may still appear."
    );
  });

  it("shows an inline retryable error on failure, not a role=alert region", async () => {
    const user = userEvent.setup();
    mocks.isError = true;
    mocks.error = new Error("Server is unavailable");
    render(<WarningCard warning={warning} onDismissed={vi.fn()} />);

    expect(screen.getByText("Server is unavailable")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.mutate).toHaveBeenCalledWith(warning.id, expect.objectContaining({}));
  });
});
