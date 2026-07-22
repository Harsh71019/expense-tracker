import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Category, CategoryRule } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { RuleTester } from "./rule-tester";

const restaurants: Category = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
  userId: "u1",
  name: "Restaurants",
  kind: "expense",
  icon: "🍜",
  color: "#ec4899",
  isArchived: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

const swiggyRule: CategoryRule = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66be21",
  userId: "u1",
  pattern: "swiggy",
  categoryId: restaurants.id,
  createdAt: new Date("2026-05-02T12:10:00.000Z"),
  updatedAt: new Date("2026-05-02T12:10:00.000Z")
};

describe("RuleTester", () => {
  it("shows nothing before any text is entered", () => {
    render(<RuleTester rules={[swiggyRule]} categories={[restaurants]} />);
    expect(screen.queryByText(/Would suggest|No rule matches/)).not.toBeInTheDocument();
  });

  it("suggests the matching category for a case-insensitive substring match", async () => {
    const user = userEvent.setup();
    render(<RuleTester rules={[swiggyRule]} categories={[restaurants]} />);

    await user.type(
      screen.getByLabelText("Test a description against your rules"),
      "SWIGGY*ORDER 4821"
    );

    expect(screen.getByText("Would suggest")).toBeVisible();
    expect(screen.getByText("Restaurants")).toBeVisible();
  });

  it("reports no match when nothing applies", async () => {
    const user = userEvent.setup();
    render(<RuleTester rules={[swiggyRule]} categories={[restaurants]} />);

    await user.type(
      screen.getByLabelText("Test a description against your rules"),
      "some other merchant"
    );

    expect(
      screen.getByText("No rule matches — this row would import uncategorized.")
    ).toBeVisible();
  });
});
