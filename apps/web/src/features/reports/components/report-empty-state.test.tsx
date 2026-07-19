import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReportEmptyState } from "./report-empty-state";

describe("ReportEmptyState", () => {
  it("shows the in-progress copy for the current month", () => {
    render(<ReportEmptyState month="2026-07" isInProgress />);
    expect(screen.getByText("No rollup for July 2026")).toBeVisible();
    expect(screen.getByText(/still in progress/)).toBeVisible();
  });

  it("shows the never-computed copy for an old month", () => {
    render(<ReportEmptyState month="2025-01" isInProgress={false} />);
    expect(screen.getByText(/never computed/)).toBeVisible();
  });
});
