import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SectionHeader } from "../section-header";

describe("SectionHeader", () => {
  it("renders a semantic section heading with supporting copy and an action", () => {
    render(
      <SectionHeader
        title="Needs attention"
        description="Complete transactions with a missing amount."
        action={<button type="button">Review</button>}
      />
    );

    expect(screen.getByRole("heading", { level: 2, name: "Needs attention" })).toBeVisible();
    expect(screen.getByText("Complete transactions with a missing amount.")).toHaveClass(
      "text-foreground-muted"
    );
    expect(screen.getByRole("button", { name: "Review" })).toBeVisible();
  });
});
