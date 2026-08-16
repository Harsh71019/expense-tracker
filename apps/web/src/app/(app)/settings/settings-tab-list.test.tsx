import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { SettingsTabList } from "./settings-tab-list";

describe("SettingsTabList", () => {
  it("exposes the active tab and stable tab URLs", () => {
    render(<SettingsTabList activeTab="appearance" />);

    expect(screen.getByRole("tablist", { name: "Settings sections" })).toBeVisible();
    expect(screen.getByRole("tablist", { name: "Settings sections" })).toHaveClass(
      "overflow-x-auto"
    );
    expect(screen.getByRole("tab", { name: /Profile/ })).toHaveClass("min-h-11");
    expect(screen.getByRole("tab", { name: /Profile/ })).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("tab", { name: /Appearance/ })).toHaveAttribute(
      "href",
      "/settings?tab=appearance"
    );
    expect(screen.getByRole("tab", { name: /Appearance/ })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("tab", { name: /Management/ })).toHaveAttribute(
      "href",
      "/settings?tab=management"
    );
    expect(screen.getByRole("tab", { name: /Invariants/ })).toHaveAttribute(
      "href",
      "/settings?tab=invariants"
    );
    expect(screen.getByRole("tab", { name: /Salary & Work/ })).toHaveAttribute(
      "href",
      "/settings?tab=income"
    );
    expect(
      screen.getByRole("tab", { name: /Management/ }).querySelector("svg")
    ).toBeInTheDocument();
  });

  it("moves focus with arrow, Home, and End keys", async () => {
    const user = userEvent.setup();
    render(<SettingsTabList activeTab="profile" />);
    const profile = screen.getByRole("tab", { name: /Profile/ });
    const appearance = screen.getByRole("tab", { name: /Appearance/ });
    const income = screen.getByRole("tab", { name: /Salary & Work/ });

    profile.focus();
    await user.keyboard("{ArrowRight}");
    expect(appearance).toHaveFocus();

    await user.keyboard("{End}");
    expect(income).toHaveFocus();

    await user.keyboard("{Home}");
    expect(profile).toHaveFocus();

    await user.keyboard("{ArrowLeft}");
    expect(income).toHaveFocus();
  });
});
