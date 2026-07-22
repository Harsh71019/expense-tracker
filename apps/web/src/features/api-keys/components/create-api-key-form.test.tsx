import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CreateApiKeyForm } from "./create-api-key-form";

describe("CreateApiKeyForm", () => {
  it("submits the name and selected scopes", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CreateApiKeyForm isPending={false} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Name"), "n8n");
    await user.click(screen.getByLabelText("Create transactions"));
    await user.click(screen.getByLabelText("Read categories"));
    await user.click(screen.getByRole("button", { name: "Create key" }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "n8n",
      permissions: { transactions: ["write"], categories: ["read"] }
    });
  });

  it("shows a validation message and does not submit when no scope is selected", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CreateApiKeyForm isPending={false} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Name"), "n8n");
    await user.click(screen.getByRole("button", { name: "Create key" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/select at least one scope/i)).toBeVisible();
  });

  it("submits an optional expiry date and allows toggling a scope back off", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CreateApiKeyForm isPending={false} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Name"), "n8n");
    await user.click(screen.getByLabelText("Create transactions"));
    await user.click(screen.getByLabelText("Read accounts"));
    await user.click(screen.getByLabelText("Read accounts"));
    fireEvent.change(screen.getByLabelText("Expires (optional)"), {
      target: { value: "2027-01-01" }
    });
    await user.click(screen.getByRole("button", { name: "Create key" }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "n8n",
      permissions: { transactions: ["write"] },
      expiresAt: new Date("2027-01-01")
    });
  });

  it("shows a pending label and disables the submit button while creating", () => {
    render(<CreateApiKeyForm isPending={true} onSubmit={vi.fn()} />);

    const button = screen.getByRole("button", { name: "Creating…" });
    expect(button).toBeVisible();
    expect(button).toBeDisabled();
  });
});
