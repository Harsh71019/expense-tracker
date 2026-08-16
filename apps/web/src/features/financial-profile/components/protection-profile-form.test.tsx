import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProtectionSnapshot } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { AppError, ConflictError } from "@/lib/errors";

import { ProtectionProfileForm } from "./protection-profile-form";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  pending: { current: false },
  key: { current: "protection-key-1" }
}));

vi.mock("../hooks/use-protection", () => ({
  useSaveProtection: () => ({
    mutateAsync: mocks.save,
    isPending: mocks.pending.current,
    idempotencyKey: mocks.key.current
  })
}));

const SNAPSHOT: ProtectionSnapshot = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "user-a",
  effectiveFrom: new Date("2026-04-01T00:00:00.000Z"),
  termCoverStatus: "employer_only",
  independentTermCoverMinor: null,
  employerTermCoverMinor: 50_00_000,
  independentTermExpiresOn: null,
  termNotApplicableReason: null,
  healthCoverStatus: "not_sure",
  independentHealthBaseCoverMinor: null,
  independentHealthSuperTopUpMinor: null,
  employerHealthCoverMinor: null,
  independentHealthExpiresOn: null,
  dependantCount: 2,
  createdAt: new Date("2026-04-01T00:00:00.000Z")
};

function reset(): void {
  mocks.save.mockReset().mockResolvedValue(SNAPSHOT);
  mocks.pending.current = false;
  mocks.key.current = "protection-key-1";
}

/**
 * Term and health ask the same questions, so several option labels legitimately
 * appear twice — index 0 is the term group, index 1 the health group. Indexed
 * without a non-null assertion, which is banned here.
 */
function first(elements: readonly HTMLElement[], index: number): HTMLElement {
  const element = elements[index];
  if (element === undefined) throw new Error(`Expected a matching element at index ${index}.`);
  return element;
}

describe("ProtectionProfileForm conditional fields", () => {
  it("starts with unknown answers and hides every amount field", () => {
    reset();
    render(<ProtectionProfileForm snapshot={null} onSaved={vi.fn()} />);

    // One "Not sure" per cover: term and health are answered independently.
    expect(screen.getAllByRole("radio", { name: /Not sure/, checked: true })).toHaveLength(2);
    expect(screen.queryByLabelText(/Your own term cover/)).toBeNull();
    expect(screen.queryByLabelText(/Employer term cover/)).toBeNull();
    expect(screen.queryByLabelText(/Your own base cover/)).toBeNull();
  });

  it("reveals only the independent term fields for an own policy", async () => {
    reset();
    const user = userEvent.setup();
    render(<ProtectionProfileForm snapshot={null} onSaved={vi.fn()} />);

    await user.click(first(screen.getAllByRole("radio", { name: /I hold my own policy/ }), 0));

    expect(screen.getByLabelText(/Your own term cover/)).toBeVisible();
    expect(screen.getByLabelText(/Policy expiry \(optional\)/)).toBeVisible();
    expect(screen.queryByLabelText(/Employer term cover/)).toBeNull();
  });

  it("reveals only the employer term field for employer-only cover", async () => {
    reset();
    const user = userEvent.setup();
    render(<ProtectionProfileForm snapshot={null} onSaved={vi.fn()} />);

    await user.click(first(screen.getAllByRole("radio", { name: /Employer cover only/ }), 0));

    expect(screen.getByLabelText(/Employer term cover/)).toBeVisible();
    expect(screen.queryByLabelText(/Your own term cover/)).toBeNull();
    expect(screen.getByText(/Employer cover usually ends when the employment does/)).toBeVisible();
  });

  it("reveals both term amount fields for both", async () => {
    reset();
    const user = userEvent.setup();
    render(<ProtectionProfileForm snapshot={null} onSaved={vi.fn()} />);

    await user.click(first(screen.getAllByRole("radio", { name: /^Both/ }), 0));

    expect(screen.getByLabelText(/Your own term cover/)).toBeVisible();
    expect(screen.getByLabelText(/Employer term cover/)).toBeVisible();
  });

  it("keeps base cover and super top-up as separate fields", async () => {
    reset();
    const user = userEvent.setup();
    render(<ProtectionProfileForm snapshot={null} onSaved={vi.fn()} />);

    await user.click(first(screen.getAllByRole("radio", { name: /I hold my own policy/ }), 1));

    expect(screen.getByLabelText(/Your own base cover/)).toBeVisible();
    expect(screen.getByLabelText(/Super top-up cover \(optional\)/)).toBeVisible();
  });

  it("asks for a structured not-applicable reason with no free-text option", async () => {
    reset();
    const user = userEvent.setup();
    render(<ProtectionProfileForm snapshot={null} onSaved={vi.fn()} />);

    await user.click(screen.getByRole("radio", { name: /Does not apply to me/ }));

    const group = screen.getByRole("radiogroup", { name: /Why does term cover not apply/ });
    expect(group).toBeVisible();
    expect(screen.getByRole("radio", { name: "Nobody depends on my income" })).toBeTruthy();
    expect(screen.getByText(/no free-text box here on purpose/)).toBeVisible();
    expect(group.querySelector("textarea")).toBeNull();
  });
});

describe("ProtectionProfileForm submission", () => {
  it("submits only the fields the chosen statuses claim", async () => {
    reset();
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<ProtectionProfileForm snapshot={null} onSaved={onSaved} />);

    await user.click(first(screen.getAllByRole("radio", { name: /Employer cover only/ }), 0));
    await user.click(screen.getByRole("button", { name: "Save protection answers" }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        termCoverStatus: "employer_only",
        independentTermCoverMinor: null,
        healthCoverStatus: "not_sure",
        independentHealthBaseCoverMinor: null,
        dependantCount: 0
      })
    );
    expect(onSaved).toHaveBeenCalledWith("Protection answers saved.");
  });

  it("moves focus to the offending field when validation fails", async () => {
    reset();
    const user = userEvent.setup();
    render(<ProtectionProfileForm snapshot={null} onSaved={vi.fn()} />);

    const dependants = screen.getByLabelText(/People who depend on your income/);
    await user.clear(dependants);
    await user.click(screen.getByRole("button", { name: "Save protection answers" }));

    expect(mocks.save).not.toHaveBeenCalled();
    await waitFor(() => expect(dependants).toHaveFocus());
  });

  it("moves focus to the reason group when a not-applicable reason is missing", async () => {
    reset();
    const user = userEvent.setup();
    render(<ProtectionProfileForm snapshot={null} onSaved={vi.fn()} />);

    await user.click(screen.getByRole("radio", { name: /Does not apply to me/ }));
    await user.click(screen.getByRole("button", { name: "Save protection answers" }));

    expect(mocks.save).not.toHaveBeenCalled();
    expect(await screen.findByText("Choose why term cover does not apply to you.")).toBeVisible();
  });

  it("lands a duplicate effective date on the date field", async () => {
    reset();
    mocks.save.mockRejectedValue(
      new ConflictError("A protection snapshot already exists for this effective date.")
    );
    const user = userEvent.setup();
    render(<ProtectionProfileForm snapshot={null} onSaved={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Save protection answers" }));

    expect(
      await screen.findByText("A protection snapshot already exists for this effective date.")
    ).toBeVisible();
  });

  it("surfaces any other mutation error in an alert without losing the answers", async () => {
    reset();
    mocks.save.mockRejectedValue(new AppError("boom"));
    const user = userEvent.setup();
    render(<ProtectionProfileForm snapshot={null} onSaved={vi.fn()} />);

    await user.click(first(screen.getAllByRole("radio", { name: /Employer cover only/ }), 0));
    await user.click(screen.getByRole("button", { name: "Save protection answers" }));

    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByRole("radio", { name: /Employer cover only/, checked: true })).toBeTruthy();
  });

  it("disables the save button while the mutation is pending", () => {
    reset();
    mocks.pending.current = true;
    render(<ProtectionProfileForm snapshot={null} onSaved={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("prefills from an existing snapshot", () => {
    reset();
    render(<ProtectionProfileForm snapshot={SNAPSHOT} onSaved={vi.fn()} />);

    expect(screen.getByRole("radio", { name: /Employer cover only/, checked: true })).toBeTruthy();
    expect(screen.getByLabelText(/People who depend on your income/)).toHaveValue("2");
  });
});

describe("ProtectionProfileForm idempotency", () => {
  it("keeps one idempotency key across retries of the same submission", async () => {
    reset();
    mocks.save.mockRejectedValue(new AppError("network"));
    const user = userEvent.setup();
    render(<ProtectionProfileForm snapshot={null} onSaved={vi.fn()} />);

    const save = screen.getByRole("button", { name: "Save protection answers" });
    await user.click(save);
    await screen.findByRole("alert");
    const keyAfterFirst = mocks.key.current;

    await user.click(save);
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));

    expect(mocks.key.current).toBe(keyAfterFirst);
  });
});
