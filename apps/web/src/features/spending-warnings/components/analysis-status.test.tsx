import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SpendingWarningAnalysis } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { AnalysisStatus } from "./analysis-status";

describe("AnalysisStatus", () => {
  it("renders the learning state without saying anything is wrong", () => {
    const analysis: SpendingWarningAnalysis = {
      status: "learning",
      eligibleKinds: [],
      baselineExpenseCount: 5
    };
    render(<AnalysisStatus analysis={analysis} hasLoadError={false} onRetry={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Learning your patterns" })).toBeVisible();
    expect(screen.getByText(/5 tracked so far/)).toBeVisible();
  });

  it("renders the unavailable state as a getting-started message", () => {
    const analysis: SpendingWarningAnalysis = {
      status: "unavailable",
      eligibleKinds: [],
      baselineExpenseCount: 0
    };
    render(<AnalysisStatus analysis={analysis} hasLoadError={false} onRetry={vi.fn()} />);

    expect(screen.getByText(/Nothing has been analyzed yet/)).toBeVisible();
  });

  it("renders the ready state with the compared-through date", () => {
    const analysis: SpendingWarningAnalysis = {
      status: "ready",
      computedAt: new Date("2026-07-24T02:15:00.000Z"),
      sourceThrough: new Date("2026-07-24T00:00:00.000Z"),
      eligibleKinds: ["overall_spend_spike"],
      baselineExpenseCount: 40
    };
    render(<AnalysisStatus analysis={analysis} hasLoadError={false} onRetry={vi.fn()} />);

    expect(screen.getByRole("heading", { name: /Compared through/ })).toBeVisible();
    expect(screen.getByText(/Last checked/)).toBeVisible();
  });

  it("renders the stale state while noting the last successful check", () => {
    const analysis: SpendingWarningAnalysis = {
      status: "stale",
      computedAt: new Date("2026-07-20T02:15:00.000Z"),
      eligibleKinds: [],
      baselineExpenseCount: 40
    };
    render(<AnalysisStatus analysis={analysis} hasLoadError={false} onRetry={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Analysis is delayed" })).toBeVisible();
    expect(screen.getByText(/Last checked/)).toBeVisible();
  });

  it("renders a retry action on load failure, using a normal heading rather than role=alert", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<AnalysisStatus analysis={undefined} hasLoadError onRetry={onRetry} />);

    expect(screen.getByRole("heading", { name: "Could not load spending patterns" })).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders nothing while the first fetch is still in flight", () => {
    const { container } = render(
      <AnalysisStatus analysis={undefined} hasLoadError={false} onRetry={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
