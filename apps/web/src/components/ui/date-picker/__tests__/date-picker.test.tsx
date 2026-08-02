import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DatePicker } from "../date-picker";

describe("DatePicker", () => {
  it("renders with placeholder and opens calendar popover on click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DatePicker onChange={onChange} placeholder="Pick a date" aria-label="Start date" />);

    const input = screen.getByLabelText("Start date");
    expect(input).toHaveAttribute("placeholder", "Pick a date");

    await user.click(input);
    expect(screen.getByRole("dialog", { name: "Start date" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Today" })).toBeVisible();
  });

  it("selects a date from the calendar grid", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DatePicker value="2026-08-01" onChange={onChange} aria-label="Start date" />);

    const input = screen.getByLabelText("Start date");
    expect(input).toHaveValue("2026-08-01");

    await user.click(input);
    await user.click(screen.getByRole("button", { name: "15" }));

    expect(onChange).toHaveBeenCalledWith("2026-08-15");
  });

  it("supports datetime mode with time inputs", async () => {
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

    const input = screen.getByLabelText("Transaction time");
    expect(input).toHaveValue("2026-08-01T14:30");

    await user.click(input);
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

    await user.click(screen.getByLabelText("Filter date"));
    await user.click(screen.getByRole("button", { name: "Today" }));

    expect(onChange).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Clear date" }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
