import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CommandPalette } from "../command-palette";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  togglePrivacyMode: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push })
}));

vi.mock("@/lib/privacy/privacy-context", () => ({
  usePrivacy: () => ({
    privacyMode: false,
    togglePrivacyMode: mocks.togglePrivacyMode
  })
}));

describe("CommandPalette", () => {
  it("renders when open and lists navigation routes", () => {
    render(<CommandPalette open={true} onClose={vi.fn()} onOpenCreateTxn={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Command Palette" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Type a command or search page…")).toBeVisible();
    expect(screen.getByText("Go to Dashboard")).toBeVisible();
    expect(screen.getByText("Go to Transactions")).toBeVisible();
    expect(screen.getByText("Go to Recurring Transactions")).toBeVisible();
    expect(screen.getByText("Go to Bills & Statements")).toBeVisible();
  });

  it("filters command list based on user query", async () => {
    const user = userEvent.setup();
    render(<CommandPalette open={true} onClose={vi.fn()} onOpenCreateTxn={vi.fn()} />);

    const input = screen.getByPlaceholderText("Type a command or search page…");
    await user.type(input, "Recurring");

    expect(screen.getByText("Go to Recurring Transactions")).toBeVisible();
    expect(screen.queryByText("Go to Dashboard")).toBeNull();
  });

  it("navigates on enter", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CommandPalette open={true} onClose={onClose} onOpenCreateTxn={vi.fn()} />);

    const input = screen.getByPlaceholderText("Type a command or search page…");
    await user.type(input, "Reports");
    await user.keyboard("{Enter}");

    expect(mocks.push).toHaveBeenCalledWith("/reports");
    expect(onClose).toHaveBeenCalled();
  });
});
