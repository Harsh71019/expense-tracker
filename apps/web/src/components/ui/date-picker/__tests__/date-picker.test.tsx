import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DatePicker } from "../date-picker";

describe("DatePicker", () => {
  it("renders with placeholder and standard text cursor", () => {
    const onChange = vi.fn();
    render(<DatePicker onChange={onChange} placeholder="Pick a date" aria-label="Start date" />);

    const input = screen.getByLabelText("Start date");
    expect(input).toHaveAttribute("placeholder", "Pick a date");
    expect(input).toHaveClass("cursor-text");
  });

  it("allows typing date manually in YYYY-MM-DD format", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DatePicker onChange={onChange} aria-label="Start date" />);

    const input = screen.getByLabelText("Start date");
    await user.type(input, "2026-08-15");

    expect(input).toHaveValue("2026-08-15");
    expect(onChange).toHaveBeenLastCalledWith("2026-08-15");
  });

  it("allows typing date in DD/MM/YYYY format and normalizes on blur", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DatePicker onChange={onChange} aria-label="Start date" />);

    const input = screen.getByLabelText("Start date");
    await user.type(input, "15/08/2026");
    await user.tab();

    expect(input).toHaveValue("2026-08-15");
    expect(onChange).toHaveBeenLastCalledWith("2026-08-15");
  });

  it("allows typing datetime manually in YYYY-MM-DDTHH:mm format", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DatePicker includeTime onChange={onChange} aria-label="Occurred at" />);

    const input = screen.getByLabelText("Occurred at");
    await user.type(input, "2026-08-15T14:30");

    expect(input).toHaveValue("2026-08-15T14:30");
    expect(onChange).toHaveBeenLastCalledWith("2026-08-15T14:30");
  });

  it("allows typing datetime with space separator and normalizes on blur", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DatePicker includeTime onChange={onChange} aria-label="Occurred at" />);

    const input = screen.getByLabelText("Occurred at");
    await user.type(input, "2026-08-15 14:30");
    await user.tab();

    expect(input).toHaveValue("2026-08-15T14:30");
    expect(onChange).toHaveBeenLastCalledWith("2026-08-15T14:30");
  });

  it("reverts invalid typed date back to current valid value on blur", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DatePicker value="2026-08-01" onChange={onChange} aria-label="Start date" />);

    const input = screen.getByLabelText("Start date");
    await user.clear(input);
    await user.type(input, "invalid-date");
    await user.tab();

    expect(input).toHaveValue("2026-08-01");
  });

  it("opens popover on calendar toggle button click and selects date from grid", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DatePicker value="2026-08-01" onChange={onChange} aria-label="Start date" />);

    const toggleBtn = screen.getByRole("button", { name: "Toggle calendar" });
    await user.click(toggleBtn);

    expect(screen.getByRole("dialog", { name: "Start date" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "15" }));

    expect(onChange).toHaveBeenCalledWith("2026-08-15");
  });

  it("supports opening popover with ArrowDown key and closing with Escape", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DatePicker onChange={onChange} aria-label="Start date" />);

    const input = screen.getByLabelText("Start date");
    input.focus();
    await user.keyboard("{ArrowDown}");

    expect(screen.getByRole("dialog", { name: "Start date" })).toBeVisible();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Start date" })).not.toBeInTheDocument();
  });

  it("supports datetime mode with time inputs in popover", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DatePicker
        value="2026-08-01T14:30"
        onChange={onChange}
        includeTime
        aria-label="Transaction time"
      />
    );

    const toggleBtn = screen.getByRole("button", { name: "Toggle calendar" });
    await user.click(toggleBtn);

    expect(screen.getByLabelText("Hours")).toHaveValue(14);
    expect(screen.getByLabelText("Minutes")).toHaveValue(30);

    const hoursInput = screen.getByLabelText("Hours");
    await user.clear(hoursInput);
    await user.type(hoursInput, "18");

    expect(onChange).toHaveBeenCalledWith("2026-08-01T18:30");
  });

  it("supports Today and Clear action buttons", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DatePicker value="2026-08-01" onChange={onChange} clearable aria-label="Filter date" />
    );

    const toggleBtn = screen.getByRole("button", { name: "Toggle calendar" });
    await user.click(toggleBtn);
    await user.click(screen.getByRole("button", { name: "Today" }));

    expect(onChange).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Clear date" }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
