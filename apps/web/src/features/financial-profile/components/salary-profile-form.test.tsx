import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FinancialProfile, SalaryVersion } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { AppError, ConflictError } from "@/lib/errors";

import { SalaryProfileForm } from "./salary-profile-form";

const mocks = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  createSalary: vi.fn(),
  profilePending: { current: false },
  salaryPending: { current: false }
}));

vi.mock("../hooks/use-salary-mutations", () => ({
  useUpdateFinancialProfile: () => ({
    mutateAsync: mocks.updateProfile,
    isPending: mocks.profilePending.current,
    idempotencyKey: "profile-key"
  }),
  useCreateSalaryVersion: () => ({
    mutateAsync: mocks.createSalary,
    isPending: mocks.salaryPending.current,
    idempotencyKey: "salary-key"
  })
}));

const PROFILE: FinancialProfile = {
  userId: "user-a",
  monthlyWorkMinutes: 8_400,
  salaryCreditDay: 5,
  expectedAnnualIncrementBps: 850,
  incomeStability: "variable",
  createdAt: new Date("2026-04-01T00:00:00.000Z"),
  updatedAt: new Date("2026-04-01T00:00:00.000Z")
};

const VERSION: SalaryVersion = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "user-a",
  netMonthlySalaryMinor: 12_50_000,
  annualCtcMinor: null,
  effectiveFrom: new Date("2026-04-01T00:00:00.000Z"),
  source: "manually_confirmed",
  createdAt: new Date("2026-04-01T00:00:00.000Z")
};

function reset(): void {
  mocks.updateProfile.mockReset().mockResolvedValue(PROFILE);
  mocks.createSalary.mockReset().mockResolvedValue(VERSION);
  mocks.profilePending.current = false;
  mocks.salaryPending.current = false;
}

describe("SalaryProfileForm setup state", () => {
  it("prefills the suggested 160 hours, keeps it editable, and only confirms it on save", async () => {
    reset();
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<SalaryProfileForm profile={null} currentSalaryVersion={null} onSaved={onSaved} />);

    const hours = screen.getByLabelText("Normal monthly working hours");
    expect(hours).toHaveValue("160");
    expect(hours).toBeEnabled();
    expect(screen.getByText(/Suggested: 160 hours a month/)).toBeVisible();

    await user.clear(hours);
    await user.type(hours, "150");

    const salary = screen.getByLabelText("Net monthly in-hand salary");
    await user.clear(salary);
    await user.type(salary, "12500");
    await user.click(screen.getByRole("button", { name: "Save salary profile" }));

    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledOnce());
    expect(mocks.updateProfile).toHaveBeenCalledWith({
      monthlyWorkMinutes: 9_000,
      incomeStability: "stable",
      salaryCreditDay: null,
      expectedAnnualIncrementBps: null
    });
    expect(mocks.createSalary).toHaveBeenCalledWith({
      netMonthlySalaryMinor: 12_50_000,
      annualCtcMinor: null,
      effectiveFrom: expect.any(Date)
    });
    expect(onSaved).toHaveBeenCalledWith("Salary and work profile saved.");
  });

  it("keeps annual CTC optional and separate from net in-hand salary", async () => {
    reset();
    const user = userEvent.setup();
    render(<SalaryProfileForm profile={null} currentSalaryVersion={null} onSaved={vi.fn()} />);

    const ctc = screen.getByLabelText("Annual CTC (optional)");
    expect(ctc).toHaveValue("₹0.00");
    expect(screen.getByText(/never counted as spendable income/)).toBeVisible();

    await user.clear(ctc);
    await user.type(ctc, "240000");
    const salary = screen.getByLabelText("Net monthly in-hand salary");
    await user.clear(salary);
    await user.type(salary, "12500");
    await user.click(screen.getByRole("button", { name: "Save salary profile" }));

    await waitFor(() =>
      expect(mocks.createSalary).toHaveBeenCalledWith(
        expect.objectContaining({ annualCtcMinor: 2_40_00_000 })
      )
    );
  });

  it("blocks submission and moves focus to the salary field when it is empty", async () => {
    reset();
    const user = userEvent.setup();
    render(<SalaryProfileForm profile={null} currentSalaryVersion={null} onSaved={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Save salary profile" }));

    expect(mocks.updateProfile).not.toHaveBeenCalled();
    expect(await screen.findByText("Enter your net monthly in-hand salary.")).toBeVisible();
    expect(screen.getByLabelText("Net monthly in-hand salary")).toHaveFocus();
  });

  it("blocks submission and moves focus to the hours field when it is invalid", async () => {
    reset();
    const user = userEvent.setup();
    render(<SalaryProfileForm profile={null} currentSalaryVersion={null} onSaved={vi.fn()} />);

    const hours = screen.getByLabelText("Normal monthly working hours");
    await user.clear(hours);
    await user.click(screen.getByRole("button", { name: "Save salary profile" }));

    expect(mocks.updateProfile).not.toHaveBeenCalled();
    expect(hours).toHaveFocus();
    expect(screen.getByText("Enter your normal monthly working hours.")).toBeVisible();
  });

  it("reports a duplicate effective date on the date field", async () => {
    reset();
    mocks.createSalary.mockRejectedValue(
      new ConflictError("A salary version already exists for this effective date.")
    );
    const user = userEvent.setup();
    render(<SalaryProfileForm profile={null} currentSalaryVersion={null} onSaved={vi.fn()} />);

    const salary = screen.getByLabelText("Net monthly in-hand salary");
    await user.clear(salary);
    await user.type(salary, "12500");
    await user.click(screen.getByRole("button", { name: "Save salary profile" }));

    expect(
      await screen.findByText("A salary version already exists for this effective date.")
    ).toBeVisible();
    expect(screen.getByLabelText("Effective from")).toHaveFocus();
  });

  it("shows a mutation pending state on the submit button", () => {
    reset();
    mocks.profilePending.current = true;
    render(<SalaryProfileForm profile={null} currentSalaryVersion={null} onSaved={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });
});

describe("SalaryProfileForm saved state", () => {
  it("hides the salary fields once a version exists, so history stays append-only", () => {
    reset();
    render(
      <SalaryProfileForm profile={PROFILE} currentSalaryVersion={VERSION} onSaved={vi.fn()} />
    );

    expect(screen.queryByLabelText("Net monthly in-hand salary")).toBeNull();
    expect(screen.queryByLabelText("Effective from")).toBeNull();
    expect(screen.getByRole("button", { name: "Save work profile" })).toBeVisible();
  });

  it("renders saved work facts in the units the user typed", () => {
    reset();
    render(
      <SalaryProfileForm profile={PROFILE} currentSalaryVersion={VERSION} onSaved={vi.fn()} />
    );

    expect(screen.getByLabelText("Normal monthly working hours")).toHaveValue("140");
    expect(screen.getByLabelText("Salary credit day (optional)")).toHaveValue("5");
    expect(screen.getByLabelText("Expected annual increment % (optional)")).toHaveValue("8.5");
    expect(screen.getByRole("radio", { name: /Variable/ })).toBeChecked();
  });

  it("saves optional work facts as canonical minutes and basis points", async () => {
    reset();
    const user = userEvent.setup();
    render(
      <SalaryProfileForm profile={PROFILE} currentSalaryVersion={VERSION} onSaved={vi.fn()} />
    );

    await user.click(screen.getByRole("radio", { name: /Irregular/ }));
    await user.click(screen.getByRole("button", { name: "Save work profile" }));

    await waitFor(() =>
      expect(mocks.updateProfile).toHaveBeenCalledWith({
        monthlyWorkMinutes: 8_400,
        incomeStability: "irregular",
        salaryCreditDay: 5,
        expectedAnnualIncrementBps: 850
      })
    );
    expect(mocks.createSalary).not.toHaveBeenCalled();
  });

  it("is fully reachable and operable from the keyboard", async () => {
    reset();
    const user = userEvent.setup();
    render(
      <SalaryProfileForm profile={PROFILE} currentSalaryVersion={VERSION} onSaved={vi.fn()} />
    );

    screen.getByLabelText("Normal monthly working hours").focus();
    // A radio group takes a single tab stop, landing on the checked option.
    await user.tab();
    expect(screen.getByRole("radio", { name: /Variable/ })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: /Irregular/ })).toBeChecked();
  });

  it("surfaces an unexpected save failure without clearing the form", async () => {
    reset();
    mocks.updateProfile.mockRejectedValue(new AppError("Network unreachable"));
    const user = userEvent.setup();
    render(
      <SalaryProfileForm profile={PROFILE} currentSalaryVersion={VERSION} onSaved={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Save work profile" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Network unreachable");
    expect(screen.getByLabelText("Normal monthly working hours")).toHaveValue("140");
  });
});
