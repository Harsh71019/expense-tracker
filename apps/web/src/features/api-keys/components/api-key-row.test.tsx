import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ApiKey } from "@vyaya/shared";
import { describe, expect, it, vi } from "vitest";

import { ApiKeyRow } from "./api-key-row";

const key: ApiKey = {
  id: "key-1",
  name: "n8n",
  start: "ak_ab",
  permissions: { transactions: ["write"] },
  enabled: true,
  createdAt: new Date("2026-05-02T12:10:00.000Z"),
  expiresAt: null,
  lastRequest: null
};

describe("ApiKeyRow", () => {
  it("shows the name and scope labels, and requests revocation without confirmation", async () => {
    const user = userEvent.setup();
    const onRevoke = vi.fn();
    render(<ApiKeyRow apiKey={key} onRevoke={onRevoke} onUpdate={vi.fn()} isUpdating={false} />);

    expect(screen.getByText("n8n")).toBeVisible();
    expect(screen.getByText("Create transactions")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Revoke" }));
    expect(onRevoke).toHaveBeenCalledWith(key);
  });

  it("toggles into edit mode and submits an updated name and scopes", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<ApiKeyRow apiKey={key} onRevoke={vi.fn()} onUpdate={onUpdate} isUpdating={false} />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const nameInput = screen.getByLabelText("Name");
    await user.clear(nameInput);
    await user.type(nameInput, "n8n renamed");
    await user.click(screen.getByLabelText("Read accounts"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onUpdate).toHaveBeenCalledWith(key.id, {
      name: "n8n renamed",
      permissions: { transactions: ["write"], accounts: ["read"] }
    });
  });

  it("discards scope changes and exits edit mode when cancelled", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<ApiKeyRow apiKey={key} onRevoke={vi.fn()} onUpdate={onUpdate} isUpdating={false} />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByLabelText("Create transactions"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Edit" })).toBeVisible();
  });

  it("shows a revoked badge and hides edit/revoke actions for a disabled key", () => {
    const revokedKey: ApiKey = { ...key, enabled: false };
    render(
      <ApiKeyRow apiKey={revokedKey} onRevoke={vi.fn()} onUpdate={vi.fn()} isUpdating={false} />
    );

    expect(screen.getByText("Revoked")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument();
  });
});
