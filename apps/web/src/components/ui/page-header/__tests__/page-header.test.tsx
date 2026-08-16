import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageHeader } from "../page-header";

describe("PageHeader", () => {
  it("renders the ledger line, one page heading, and a primary action", () => {
    render(
      <PageHeader
        eyebrow="Ledger / transactions"
        title="Transactions"
        description="Review posted entries and reversals."
        action={<button type="button">Add transaction</button>}
      />
    );

    expect(screen.getByText("Ledger / transactions")).toHaveClass("font-mono", "text-2xs");
    expect(screen.getByRole("heading", { level: 1, name: "Transactions" })).toHaveClass(
      "text-2xl",
      "sm:text-3xl"
    );
    expect(screen.getByText("Review posted entries and reversals.")).toHaveClass("max-w-xl");
    expect(screen.getByRole("button", { name: "Add transaction" })).toBeVisible();
  });

  it("uses the compact title scale for focused routes", () => {
    render(<PageHeader eyebrow="Capture / quick add" size="compact" title="Add transaction" />);

    expect(screen.getByRole("heading", { level: 1, name: "Add transaction" })).toHaveClass(
      "text-xl",
      "sm:text-2xl"
    );
  });
});
