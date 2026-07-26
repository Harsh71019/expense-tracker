import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WarningEmptyState } from "./warning-empty-state";

describe("WarningEmptyState", () => {
  it("does not claim spending is safe in the no-warnings variant", () => {
    render(<WarningEmptyState variant="no-warnings" />);
    expect(screen.getByText("No unusual spending patterns right now")).toBeVisible();
    expect(
      screen.getByText(/isn't a statement that your spending is safe or risk-free/)
    ).toBeVisible();
  });

  it("offers a way back to the unfiltered list in the filtered variant", () => {
    render(<WarningEmptyState variant="filtered" />);
    expect(screen.getByText("No spending patterns match this filter")).toBeVisible();
    expect(screen.getByRole("link", { name: "Show all" })).toHaveAttribute(
      "href",
      "/spending-warnings"
    );
  });
});
