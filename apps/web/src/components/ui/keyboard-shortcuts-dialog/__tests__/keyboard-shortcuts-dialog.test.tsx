import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { KeyboardShortcutsDialog } from "../keyboard-shortcuts-dialog";

describe("KeyboardShortcutsDialog", () => {
  it("renders when open and lists keyboard shortcuts", () => {
    render(<KeyboardShortcutsDialog open={true} onClose={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Keyboard Shortcuts" })).toBeVisible();
    expect(screen.getByText("Open Command Palette / Search")).toBeVisible();
    expect(screen.getByText("Toggle Privacy Mode (hide balances)")).toBeVisible();
  });

  it("does not render when closed", () => {
    render(<KeyboardShortcutsDialog open={false} onClose={vi.fn()} />);

    expect(screen.queryByRole("heading", { name: "Keyboard Shortcuts" })).toBeNull();
  });
});
