import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { DialogSurface } from "../dialog-surface";

function DialogHarness(): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      {open ? (
        <DialogSurface labelledBy="test-dialog-title" onClose={() => setOpen(false)}>
          <h2 id="test-dialog-title">Test dialog</h2>
          <button type="button">First action</button>
          <button type="button">Last action</button>
        </DialogSurface>
      ) : null}
    </>
  );
}

function NestedDialogHarness(): ReactNode {
  const [parentOpen, setParentOpen] = useState(false);
  const [childOpen, setChildOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setParentOpen(true)}>
        Open parent
      </button>
      {parentOpen ? (
        <DialogSurface labelledBy="parent-title" onClose={() => setParentOpen(false)}>
          <h2 id="parent-title">Parent dialog</h2>
          <button type="button" onClick={() => setChildOpen(true)}>
            Open confirmation
          </button>
          {childOpen ? (
            <DialogSurface labelledBy="child-title" onClose={() => setChildOpen(false)}>
              <h2 id="child-title">Child dialog</h2>
              <button type="button">Confirm action</button>
            </DialogSurface>
          ) : null}
        </DialogSurface>
      ) : null}
    </>
  );
}

describe("DialogSurface", () => {
  afterEach(() => {
    document.body.style.overflow = "";
  });

  it("locks page scroll, closes with Escape, and returns focus", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);

    const opener = screen.getByRole("button", { name: "Open dialog" });
    await user.click(opener);

    expect(screen.getByRole("dialog", { name: "Test dialog" })).toBeVisible();
    expect(document.body.style.overflow).toBe("hidden");
    expect(screen.getByRole("button", { name: "First action" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Test dialog" })).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(opener).toHaveFocus();
  });

  it("keeps Tab focus inside the dialog", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);

    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    const first = screen.getByRole("button", { name: "First action" });
    const last = screen.getByRole("button", { name: "Last action" });

    last.focus();
    await user.tab();
    expect(first).toHaveFocus();

    await user.tab({ shift: true });
    expect(last).toHaveFocus();
  });

  it("closes only the topmost dialog with Escape", async () => {
    const user = userEvent.setup();
    render(<NestedDialogHarness />);

    await user.click(screen.getByRole("button", { name: "Open parent" }));
    await user.click(screen.getByRole("button", { name: "Open confirmation" }));
    expect(screen.getByRole("dialog", { name: "Child dialog" })).toBeVisible();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Child dialog" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Parent dialog" })).toBeVisible();
    expect(document.body.style.overflow).toBe("hidden");
  });
});
