import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import GlobalError from "./global-error";
import RouteError from "./error";

const mocks = vi.hoisted(() => ({ captureException: vi.fn(() => "abcdef123") }));

vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));

describe("error boundaries", () => {
  it("reports and resets a route error", async () => {
    const reset = vi.fn();
    const user = userEvent.setup();
    render(<RouteError error={new Error("Broken")} reset={reset} />);

    expect(await screen.findByText("ref abcdef")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it("reports and resets a global error", async () => {
    const reset = vi.fn();
    const user = userEvent.setup();
    render(<GlobalError error={new Error("Broken")} reset={reset} />);

    expect(await screen.findByText("ref abcdef")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Reload" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
