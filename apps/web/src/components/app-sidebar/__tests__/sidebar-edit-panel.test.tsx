import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SidebarEditPanel } from "../sidebar-edit-panel";

const sampleItems = [
  { href: "/dash", label: "Dashboard", icon: "⌂", visible: true },
  { href: "/acc", label: "Accounts", icon: "▣", visible: true },
  { href: "/hidden-item", label: "Hidden Item", icon: "✦", visible: false }
] as const;

describe("SidebarEditPanel", () => {
  it("renders all item labels", () => {
    render(
      <SidebarEditPanel
        items={sampleItems}
        compact={false}
        onReorder={vi.fn()}
        onToggle={vi.fn()}
        onReset={vi.fn()}
      />
    );

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Accounts")).toBeInTheDocument();
    expect(screen.getByText("Hidden Item")).toBeInTheDocument();
  });

  it("calls onToggle with correct href when visibility button is clicked", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();

    render(
      <SidebarEditPanel
        items={sampleItems}
        compact={false}
        onReorder={vi.fn()}
        onToggle={onToggle}
        onReset={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Hide Dashboard" }));
    expect(onToggle).toHaveBeenCalledWith("/dash");

    await user.click(screen.getByRole("button", { name: "Show Hidden Item" }));
    expect(onToggle).toHaveBeenCalledWith("/hidden-item");
  });

  it("calls onReorder with correct indices when keyboard move buttons are clicked", async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();

    render(
      <SidebarEditPanel
        items={sampleItems}
        compact={false}
        onReorder={onReorder}
        onToggle={vi.fn()}
        onReset={vi.fn()}
      />
    );

    // Click Move Accounts up (index 1 -> 0)
    await user.click(screen.getByRole("button", { name: "Move Accounts up" }));
    expect(onReorder).toHaveBeenCalledWith(1, 0);

    // Click Move Accounts down (index 1 -> 2)
    await user.click(screen.getByRole("button", { name: "Move Accounts down" }));
    expect(onReorder).toHaveBeenCalledWith(1, 2);
  });

  it("disables move-up button on first item and move-down button on last item", () => {
    render(
      <SidebarEditPanel
        items={sampleItems}
        compact={false}
        onReorder={vi.fn()}
        onToggle={vi.fn()}
        onReset={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Move Dashboard up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Hidden Item down" })).toBeDisabled();
  });

  it("calls onReset when Restore defaults is clicked", async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();

    render(
      <SidebarEditPanel
        items={sampleItems}
        compact={false}
        onReorder={vi.fn()}
        onToggle={vi.fn()}
        onReset={onReset}
      />
    );

    await user.click(screen.getByRole("button", { name: "Restore defaults" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("sets correct aria-pressed state on toggle buttons", () => {
    render(
      <SidebarEditPanel
        items={sampleItems}
        compact={false}
        onReorder={vi.fn()}
        onToggle={vi.fn()}
        onReset={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Hide Dashboard" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "Show Hidden Item" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("applies opacity-40 class to hidden items", () => {
    render(
      <SidebarEditPanel
        items={sampleItems}
        compact={false}
        onReorder={vi.fn()}
        onToggle={vi.fn()}
        onReset={vi.fn()}
      />
    );

    const listItems = screen.getAllByRole("listitem");
    expect(listItems[0]).not.toHaveClass("opacity-40");
    expect(listItems[2]).toHaveClass("opacity-40");
  });
});
