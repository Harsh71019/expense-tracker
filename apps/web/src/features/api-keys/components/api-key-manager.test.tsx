import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ApiKey } from "@treasury-ops/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiKeyManager } from "./api-key-manager";

const mocks = vi.hoisted(() => {
  const apiKeys: ApiKey[] = [];
  return {
    apiKeys,
    apiKeysReturnUndefined: false,
    createMutateAsync: vi.fn(),
    createPending: false,
    updateMutateAsync: vi.fn(),
    updatePending: false,
    revokeMutateAsync: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn()
  };
});

vi.mock("../hooks/use-api-keys", () => ({
  useApiKeys: () => ({ data: mocks.apiKeysReturnUndefined ? undefined : mocks.apiKeys }),
  useCreateApiKey: () => ({ mutateAsync: mocks.createMutateAsync, isPending: mocks.createPending }),
  useUpdateApiKey: () => ({ mutateAsync: mocks.updateMutateAsync, isPending: mocks.updatePending }),
  useRevokeApiKey: () => ({ mutateAsync: mocks.revokeMutateAsync })
}));

vi.mock("@/lib/toast", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess }
}));

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

describe("ApiKeyManager", () => {
  beforeEach(() => {
    mocks.apiKeys = [];
    mocks.apiKeysReturnUndefined = false;
    mocks.createPending = false;
    mocks.updatePending = false;
    mocks.createMutateAsync.mockReset();
    mocks.updateMutateAsync.mockReset();
    mocks.revokeMutateAsync.mockReset();
    mocks.toastError.mockReset();
    mocks.toastSuccess.mockReset();
  });

  it("shows the zero state when there are no keys", async () => {
    const user = userEvent.setup();
    render(<ApiKeyManager initialApiKeys={[]} />);
    expect(screen.getByRole("tab", { name: "All keys" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("No API keys yet")).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Add key" }));
    expect(screen.getByLabelText("Name")).toBeVisible();
  });

  it("reveals the raw key once after a successful create, then hides it on dismiss", async () => {
    const user = userEvent.setup();
    mocks.createMutateAsync.mockResolvedValue({ ...key, key: "ak_secret123" });
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) }
    });
    render(<ApiKeyManager initialApiKeys={[]} />);

    await user.click(screen.getByRole("tab", { name: "Add key" }));
    await user.type(screen.getByLabelText("Name"), "n8n");
    await user.click(screen.getByLabelText("Create transactions"));
    await user.click(screen.getByRole("button", { name: "Create key" }));

    expect(mocks.toastSuccess).toHaveBeenCalledWith("API key created");
    expect(screen.queryByText("ak_secret123")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View new API key" }));
    expect(await screen.findByText("ak_secret123")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByText("ak_secret123")).not.toBeInTheDocument();
  });

  it("revokes a key without confirmation", async () => {
    const user = userEvent.setup();
    mocks.apiKeys = [key];
    mocks.revokeMutateAsync.mockResolvedValue(undefined);
    render(<ApiKeyManager initialApiKeys={mocks.apiKeys} />);

    await user.click(screen.getByRole("button", { name: "Revoke" }));
    expect(mocks.revokeMutateAsync).toHaveBeenCalledWith("key-1");
    expect(mocks.toastSuccess).toHaveBeenCalledWith("API key revoked");
  });

  it("updates a key from its row", async () => {
    const user = userEvent.setup();
    mocks.apiKeys = [key];
    mocks.updateMutateAsync.mockResolvedValue(undefined);
    render(<ApiKeyManager initialApiKeys={mocks.apiKeys} />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const nameInput = screen.getByLabelText("Name", { selector: `#api-key-name-${key.id}` });
    await user.clear(nameInput);
    await user.type(nameInput, "n8n renamed");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mocks.updateMutateAsync).toHaveBeenCalledWith({
      keyId: "key-1",
      input: { name: "n8n renamed", permissions: { transactions: ["write"] } }
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith("API key updated");
  });

  it("shows an error toast when create, update, or revoke fails", async () => {
    const user = userEvent.setup();
    mocks.apiKeys = [key];
    mocks.createMutateAsync.mockRejectedValue(new Error("boom"));
    mocks.updateMutateAsync.mockRejectedValue(new Error("boom"));
    mocks.revokeMutateAsync.mockRejectedValue(new Error("boom"));
    render(<ApiKeyManager initialApiKeys={mocks.apiKeys} />);

    await user.click(screen.getByRole("tab", { name: "Add key" }));
    await user.type(screen.getByLabelText("Name"), "n8n");
    await user.click(screen.getByLabelText("Create transactions"));
    await user.click(screen.getByRole("button", { name: "Create key" }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Could not create this key"));

    await user.click(screen.getByRole("tab", { name: "All keys" }));
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Could not update this key"));

    await user.click(screen.getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Could not revoke this key"));
  });

  it("falls back to the server-rendered initial keys when the query has no data yet", () => {
    mocks.apiKeysReturnUndefined = true;
    render(<ApiKeyManager initialApiKeys={[key]} />);

    expect(screen.getByText("n8n")).toBeVisible();
  });
});
