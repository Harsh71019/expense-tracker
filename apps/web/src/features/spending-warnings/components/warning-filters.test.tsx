import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { WarningFilters } from "./warning-filters";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

describe("WarningFilters", () => {
  it("marks the active filter and navigates without a query param for clear", async () => {
    const user = userEvent.setup();
    render(<WarningFilters filters={{ filter: "spikes" }} />);

    expect(screen.getByRole("combobox", { name: "Filter pattern type" })).toHaveTextContent(
      "Spending spikes"
    );
    expect(screen.getByRole("button", { name: "Clear" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(mocks.push).toHaveBeenCalledWith("/spending-warnings");
  });

  it("navigates with a filter query param for a non-default selection", async () => {
    const user = userEvent.setup();
    render(<WarningFilters filters={{ filter: "all" }} />);

    await user.click(screen.getByRole("combobox", { name: "Filter pattern type" }));
    await user.click(screen.getByRole("option", { name: "Large expenses" }));
    expect(mocks.push).toHaveBeenCalledWith("/spending-warnings?filter=large_expenses");
  });
});
