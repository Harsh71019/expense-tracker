import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SalaryVersion } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { ConflictError } from "@/lib/errors";

import { AddSalaryChangeSheet } from "./add-salary-change-sheet";

const mocks = vi.hoisted(() => ({
  createSalary: vi.fn(),
  pending: { current: false },
  key: { current: "stable-idempotency-key" }
}));

vi.mock("../hooks/use-salary-mutations", () => ({
  useCreateSalaryVersion: () => ({
    mutateAsync: mocks.createSalary,
    isPending: mocks.pending.current,
    idempotencyKey: mocks.key.current
  })
}));

const VERSION: SalaryVersion = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "user-a",
  netMonthlySalaryMinor: 14_00_000,
  annualCtcMinor: null,
  effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
  source: "manually_confirmed",
  createdAt: new Date("2026-08-16T00:00:00.000Z")
};

function reset(): void {
  mocks.createSalary.mockReset().mockResolvedValue(VERSION);
  mocks.pending.current = false;
  mocks.key.current = "stable-idempotency-key";
}

describe("AddSalaryChangeSheet", () => {
  it("appends a version with a canonical paise amount and effective date", async () => {
    reset();
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(<AddSalaryChangeSheet onClose={onClose} onSaved={onSaved} />);

    expect(screen.getByRole("dialog", { name: "Add salary change" })).toBeVisible();
    expect(screen.getByText(/Earlier versions stay exactly as they are/)).toBeVisible();

    const salary = screen.getByLabelText("Net monthly in-hand salary");
    await user.clear(salary);
    await user.type(salary, "14000");
    const effectiveFrom = screen.getByLabelText("Effective from");
    await user.clear(effectiveFrom);
    await user.type(effectiveFrom, "2026-09-01");
    await user.click(screen.getByRole("button", { name: "Save salary change" }));

    await waitFor(() =>
      expect(mocks.createSalary).toHaveBeenCalledWith({
        netMonthlySalaryMinor: 14_00_000,
        annualCtcMinor: null,
        effectiveFrom: new Date("2026-09-01T00:00:00.000Z")
      })
    );
    expect(onSaved).toHaveBeenCalledWith("Salary change added.");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("retries the identical submission after a failure, leaving deduplication to the key", async () => {
    reset();
    mocks.createSalary.mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<AddSalaryChangeSheet onClose={vi.fn()} onSaved={onSaved} />);

    const salary = screen.getByLabelText("Net monthly in-hand salary");
    await user.clear(salary);
    await user.type(salary, "14000");

    await user.click(screen.getByRole("button", { name: "Save salary change" }));
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(onSaved).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save salary change" }));
    await waitFor(() => expect(mocks.createSalary).toHaveBeenCalledTimes(2));
    // Same request intent both times — the hook's mount-scoped idempotency
    // key is what stops the second attempt appending a second version.
    expect(mocks.createSalary.mock.calls[0]?.[0]).toEqual(mocks.createSalary.mock.calls[1]?.[0]);
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("shows a duplicate-effective-date problem on the date field and focuses it", async () => {
    reset();
    mocks.createSalary.mockRejectedValue(
      new ConflictError("A salary version already exists for this effective date.")
    );
    const user = userEvent.setup();
    render(<AddSalaryChangeSheet onClose={vi.fn()} onSaved={vi.fn()} />);

    const salary = screen.getByLabelText("Net monthly in-hand salary");
    await user.clear(salary);
    await user.type(salary, "14000");
    await user.click(screen.getByRole("button", { name: "Save salary change" }));

    expect(
      await screen.findByText("A salary version already exists for this effective date.")
    ).toBeVisible();
    expect(screen.getByLabelText("Effective from")).toHaveFocus();
  });

  it("blocks an empty salary and moves focus to it", async () => {
    reset();
    const user = userEvent.setup();
    render(<AddSalaryChangeSheet onClose={vi.fn()} onSaved={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Save salary change" }));

    expect(mocks.createSalary).not.toHaveBeenCalled();
    expect(await screen.findByText("Enter your net monthly in-hand salary.")).toBeVisible();
    expect(screen.getByLabelText("Net monthly in-hand salary")).toHaveFocus();
  });

  it("shows the pending state while the mutation is in flight", () => {
    reset();
    mocks.pending.current = true;
    render(<AddSalaryChangeSheet onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("closes on Escape without saving", async () => {
    reset();
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AddSalaryChangeSheet onClose={onClose} onSaved={vi.fn()} />);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
    expect(mocks.createSalary).not.toHaveBeenCalled();
  });

  it("labels annual CTC as optional and never as spendable income", () => {
    reset();
    render(<AddSalaryChangeSheet onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(screen.getByLabelText("Annual CTC (optional)")).toBeVisible();
    expect(screen.getByText(/never treated as spendable income/)).toBeVisible();
  });
});
