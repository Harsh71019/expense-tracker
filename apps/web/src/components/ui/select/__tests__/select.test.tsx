import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Select, type SelectOption } from "../select";

const testOptions: readonly SelectOption[] = [
  { value: "", label: "All accounts" },
  { value: "acc-1", label: "HDFC Bank" },
  { value: "acc-2", label: "ICICI Bank" },
  { value: "acc-3", label: "Closed Account", disabled: true }
];

describe("Select", () => {
  it("renders trigger button with placeholder when no value is selected", () => {
    render(
      <Select
        options={testOptions}
        onChange={vi.fn()}
        placeholder="Filter by account"
        aria-label="Filter by account"
      />
    );

    const trigger = screen.getByRole("combobox", { name: "Filter by account" });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent("Filter by account");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("renders selected option label when value matches an option", () => {
    render(
      <Select
        options={testOptions}
        value="acc-1"
        onChange={vi.fn()}
        aria-label="Filter by account"
      />
    );

    const trigger = screen.getByRole("combobox", { name: "Filter by account" });
    expect(trigger).toHaveTextContent("HDFC Bank");
  });

  it("opens option listbox when clicked and selects an option", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <Select options={testOptions} value="" onChange={onChange} aria-label="Filter by account" />
    );

    const trigger = screen.getByRole("combobox", { name: "Filter by account" });
    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const listbox = screen.getByRole("listbox");
    expect(listbox).toBeInTheDocument();

    const option = screen.getByRole("option", { name: "ICICI Bank" });
    await user.click(option);

    expect(onChange).toHaveBeenCalledWith("acc-2");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("navigates and selects options using keyboard", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <Select options={testOptions} value="" onChange={onChange} aria-label="Filter by account" />
    );

    const trigger = screen.getByRole("combobox", { name: "Filter by account" });
    trigger.focus();

    // Open via ArrowDown
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    // Navigate to second item ("HDFC Bank")
    await user.keyboard("{ArrowDown}");

    // Select with Enter
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("acc-1");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes open listbox on Escape key", async () => {
    const user = userEvent.setup();

    render(<Select options={testOptions} onChange={vi.fn()} aria-label="Filter by account" />);

    const trigger = screen.getByRole("combobox", { name: "Filter by account" });
    await user.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("respects disabled state and prevents opening", async () => {
    const user = userEvent.setup();

    render(
      <Select options={testOptions} onChange={vi.fn()} disabled aria-label="Filter by account" />
    );

    const trigger = screen.getByRole("combobox", { name: "Filter by account" });
    expect(trigger).toBeDisabled();

    await user.click(trigger);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
