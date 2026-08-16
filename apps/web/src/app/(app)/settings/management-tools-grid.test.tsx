import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ManagementToolsGrid, type ManagementGroup } from "./management-tools-grid";

const mockGroups: readonly ManagementGroup[] = [
  {
    id: "ledger",
    label: "Money & Ledger",
    countTag: "2 Core Subsystems",
    description: "Account balances and categories.",
    items: [
      {
        href: "/accounts",
        label: "Accounts",
        description: "Bank and card balances",
        iconName: "Landmark",
        badge: "Double-Entry"
      },
      {
        href: "/categories",
        label: "Categories",
        description: "Classification taxonomy",
        iconName: "Tag",
        badge: "Taxonomy"
      }
    ]
  },
  {
    id: "planning",
    label: "Automation & Planning",
    countTag: "1 Rule Engine",
    description: "Budgets and targets.",
    items: [
      {
        href: "/budgets",
        label: "Budgets",
        description: "Monthly spending limits",
        iconName: "PieChart",
        badge: "Envelopes"
      }
    ]
  }
];

describe("ManagementToolsGrid", () => {
  it("renders all groups and items by default", () => {
    render(<ManagementToolsGrid groups={mockGroups} />);

    expect(screen.getByRole("heading", { name: "Money & Ledger" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Automation & Planning" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Accounts/i })).toHaveAttribute("href", "/accounts");
    expect(screen.getByRole("link", { name: /Budgets/i })).toHaveAttribute("href", "/budgets");
  });

  it("filters items by search input", async () => {
    const user = userEvent.setup();
    render(<ManagementToolsGrid groups={mockGroups} />);

    const searchInput = screen.getByLabelText("Search management tools");
    await user.type(searchInput, "budget");

    expect(screen.getByRole("link", { name: /Budgets/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Accounts/i })).not.toBeInTheDocument();
  });

  it("filters items by category button", async () => {
    const user = userEvent.setup();
    render(<ManagementToolsGrid groups={mockGroups} />);

    const automationBtn = screen.getByRole("button", {
      name: /Automation & Planning \(1\)/i
    });
    await user.click(automationBtn);

    expect(screen.getByRole("link", { name: /Budgets/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Accounts/i })).not.toBeInTheDocument();
  });

  it("shows empty state when no items match and allows reset", async () => {
    const user = userEvent.setup();
    render(<ManagementToolsGrid groups={mockGroups} />);

    const searchInput = screen.getByLabelText("Search management tools");
    await user.type(searchInput, "nonexistent");

    expect(screen.getByText("No matching modules found")).toBeInTheDocument();

    const resetBtn = screen.getByRole("button", { name: "Reset Filters" });
    await user.click(resetBtn);

    expect(screen.getByRole("link", { name: /Accounts/i })).toBeInTheDocument();
  });
});
