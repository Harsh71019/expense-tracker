import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Category } from "@treasury-ops/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ValidationError } from "@/lib/errors";

import { CreateCategorySheet } from "./create-category-sheet";

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  updateMutateAsync: vi.fn(),
  updateGroupMutateAsync: vi.fn(),
  pending: false,
  updatePending: false,
  updateGroupPending: false,
  toastError: vi.fn(),
  toastSuccess: vi.fn()
}));

vi.mock("../hooks/use-category-mutations", () => ({
  useCreateCategory: () => ({ mutateAsync: mocks.mutateAsync, isPending: mocks.pending }),
  useUpdateCategory: () => ({
    mutateAsync: mocks.updateMutateAsync,
    isPending: mocks.updatePending
  }),
  useUpdateCategoryGroup: () => ({
    mutateAsync: mocks.updateGroupMutateAsync,
    isPending: mocks.updateGroupPending
  })
}));

vi.mock("@/lib/toast", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess }
}));

const groceries: Category = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
  userId: "u1",
  name: "Groceries",
  kind: "expense",
  isArchived: false,
  createdAt: new Date("2026-01-08T09:24:00.000Z"),
  updatedAt: new Date("2026-01-08T09:24:00.000Z")
};

const salary: Category = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66beff",
  userId: "u1",
  name: "Salary",
  kind: "income",
  isArchived: false,
  createdAt: new Date("2026-01-05T07:00:00.000Z"),
  updatedAt: new Date("2026-01-05T07:00:00.000Z")
};

describe("CreateCategorySheet", () => {
  beforeEach(() => {
    mocks.pending = false;
    mocks.updatePending = false;
    mocks.updateGroupPending = false;
    mocks.mutateAsync.mockReset();
    mocks.updateMutateAsync.mockReset();
    mocks.updateGroupMutateAsync.mockReset();
    mocks.toastError.mockReset();
    mocks.toastSuccess.mockReset();
  });

  it("disables Create category until a name is entered", async () => {
    const user = userEvent.setup();
    render(<CreateCategorySheet defaultKind="expense" categories={[]} onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Create category" })).toBeDisabled();
    await user.type(screen.getByLabelText("Name"), "Travel");
    expect(screen.getByRole("button", { name: "Create category" })).toBeEnabled();
  });

  it("creates a category with the selected kind, group, icon, colour, and parent", async () => {
    const user = userEvent.setup();
    mocks.mutateAsync.mockResolvedValue({});
    const onClose = vi.fn();
    render(
      <CreateCategorySheet defaultKind="expense" categories={[groceries]} onClose={onClose} />
    );

    await user.type(screen.getByLabelText("Name"), "Groceries: Meat");
    await user.click(screen.getByRole("button", { name: /essential/i }));
    await user.click(screen.getByRole("combobox", { name: "Parent category" }));
    await user.click(screen.getByRole("option", { name: "Groceries" }));
    await user.click(screen.getByRole("button", { name: "utensils" }));
    await user.click(screen.getByRole("button", { name: "#f97316" }));
    await user.click(screen.getByRole("button", { name: "Create category" }));

    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      name: "Groceries: Meat",
      kind: "expense",
      group: "essential",
      parentId: groceries.id,
      icon: "utensils",
      color: "#f97316"
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("filters the parent option list by the selected kind", async () => {
    const user = userEvent.setup();
    render(
      <CreateCategorySheet
        defaultKind="expense"
        categories={[groceries, salary]}
        onClose={vi.fn()}
      />
    );

    await user.click(screen.getByRole("combobox", { name: "Parent category" }));
    expect(screen.getByRole("option", { name: "Groceries" })).toBeVisible();
    expect(screen.queryByRole("option", { name: "Salary" })).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Income" }));
    await user.click(screen.getByRole("combobox", { name: "Parent category" }));
    expect(screen.getByRole("option", { name: "Salary" })).toBeVisible();
    expect(screen.queryByRole("option", { name: "Groceries" })).not.toBeInTheDocument();
  });

  it("edits name, icon, colour, and parent without changing kind", async () => {
    const user = userEvent.setup();
    mocks.updateMutateAsync.mockResolvedValue({ ...groceries, name: "Home food" });
    const onClose = vi.fn();
    render(
      <CreateCategorySheet
        defaultKind="expense"
        categories={[groceries]}
        category={groceries}
        onClose={onClose}
      />
    );

    expect(screen.queryByRole("button", { name: "Income" })).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Home food");
    await user.click(screen.getByRole("button", { name: "coffee" }));
    await user.click(screen.getByRole("button", { name: "#3b82f6" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mocks.updateMutateAsync).toHaveBeenCalledWith({
      categoryId: groceries.id,
      patch: {
        name: "Home food",
        parentId: null,
        icon: "coffee",
        color: "#3b82f6"
      }
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("closes without creating on Cancel", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CreateCategorySheet defaultKind="expense" categories={[]} onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  it("can pick then clear an icon and a colour back to none", async () => {
    const user = userEvent.setup();
    mocks.mutateAsync.mockResolvedValue({});
    render(<CreateCategorySheet defaultKind="expense" categories={[]} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText("Name"), "Travel");

    await user.click(screen.getByRole("button", { name: "plane" }));
    expect(screen.getByRole("button", { name: "plane" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "No icon" }));
    expect(screen.getByRole("button", { name: "No icon" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "#3b82f6" }));
    await user.click(screen.getByRole("button", { name: "No colour" }));
    await user.click(screen.getByRole("button", { name: "Create category" }));

    expect(mocks.mutateAsync).toHaveBeenCalledWith(
      expect.not.objectContaining({ icon: expect.anything(), color: expect.anything() })
    );
  });

  it("maps a validation error from the API onto the matching field", async () => {
    const user = userEvent.setup();
    mocks.mutateAsync.mockRejectedValue(
      new ValidationError("Invalid", {}, [
        { path: "name", code: "invalid", message: "Name already in use" }
      ])
    );
    render(<CreateCategorySheet defaultKind="expense" categories={[]} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText("Name"), "Travel");
    await user.click(screen.getByRole("button", { name: "Create category" }));

    expect(await screen.findByText("Name already in use")).toBeVisible();
  });

  it("shows a toast for a non-validation failure", async () => {
    const user = userEvent.setup();
    mocks.mutateAsync.mockRejectedValue(new Error("network down"));
    render(<CreateCategorySheet defaultKind="expense" categories={[]} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText("Name"), "Travel");
    await user.click(screen.getByRole("button", { name: "Create category" }));

    await vi.waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith("Could not create this category");
    });
  });

  it("shows a Creating… label while the mutation is pending", () => {
    mocks.pending = true;
    render(<CreateCategorySheet defaultKind="expense" categories={[]} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Creating…" })).toBeDisabled();
  });
});
