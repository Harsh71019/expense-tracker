import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmptyState } from "../empty-state";

describe("EmptyState", () => {
  it("renders empty state with title, description, and action button", () => {
    render(
      <EmptyState
        title="No entries"
        description="Start with chai."
        action={<button type="button">Add</button>}
      />
    );
    expect(screen.getByRole("heading", { name: "No entries" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add" })).toBeVisible();
  });
});
