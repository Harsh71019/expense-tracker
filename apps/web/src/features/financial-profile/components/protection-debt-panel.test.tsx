import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Asset, DeclaredDebt, DeclaredDebtPage, ProtectionState } from "@treasury-ops/shared";
import type { Mock } from "vitest";
import { describe, expect, it, vi } from "vitest";

import { ProtectionDebtPanel } from "./protection-debt-panel";

const mocks = vi.hoisted(
  (): {
    protection: { current: ProtectionState | null };
    protectionPending: { current: boolean };
    debts: { current: DeclaredDebtPage | null };
    debtsPending: { current: boolean };
    save: Mock;
    create: Mock;
    update: Mock;
    toastSuccess: Mock;
  } => ({
    protection: { current: null },
    protectionPending: { current: false },
    debts: { current: null },
    debtsPending: { current: false },
    save: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    toastSuccess: vi.fn()
  })
);

/** Indexing a query result without a non-null assertion, which is banned here. */
function first(elements: readonly HTMLElement[]): HTMLElement {
  const [element] = elements;
  if (element === undefined) throw new Error("Expected at least one matching element.");
  return element;
}

vi.mock("../hooks/use-protection", () => ({
  useProtectionState: () => ({
    data: mocks.protection.current,
    isPending: mocks.protectionPending.current
  }),
  useSaveProtection: () => ({
    mutateAsync: mocks.save,
    isPending: false,
    idempotencyKey: "protection-key"
  })
}));

vi.mock("../hooks/use-debt-profile", () => ({
  useDeclaredDebts: () => ({ data: mocks.debts.current, isPending: mocks.debtsPending.current }),
  useCreateDeclaredDebt: () => ({
    mutateAsync: mocks.create,
    isPending: false,
    idempotencyKey: "debt-key"
  }),
  useUpdateDeclaredDebt: () => ({
    mutateAsync: mocks.update,
    isPending: false,
    idempotencyKey: "resolve-key"
  })
}));

vi.mock("@/lib/toast", () => ({ toast: { success: mocks.toastSuccess } }));

const NOT_CONFIGURED: ProtectionState = {
  configured: false,
  currentSnapshot: null,
  upcomingSnapshot: null,
  asOf: new Date("2026-08-16T00:00:00.000Z"),
  dataQuality: "unavailable",
  termCover: {
    state: "not_configured",
    expiryState: "not_applicable",
    expiresOn: null,
    hasIndependentCover: false,
    hasEmployerCover: false
  },
  healthCover: {
    state: "not_configured",
    expiryState: "not_applicable",
    expiresOn: null,
    hasIndependentCover: false,
    hasEmployerCover: false
  },
  expiringSoonDays: 90,
  limitations: [
    "No protection answers recorded yet, so protection status is unknown rather than safe."
  ]
};

const DEBT: DeclaredDebt = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "user-a",
  name: "Amex revolve",
  kind: "credit_card",
  declaredOutstandingMinor: 85_000_00,
  outstandingMinor: 85_000_00,
  annualRateBps: 4_200,
  minimumPaymentMinor: null,
  linkedAssetId: null,
  linkedAssetName: null,
  amountSource: "declared",
  valuationAsOf: null,
  isEstimate: true,
  isHighCost: true,
  status: "active",
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  resolvedAt: null
};

const DEBT_PAGE: DeclaredDebtPage = {
  items: [DEBT],
  pageInfo: { nextCursor: null, hasMore: false, limit: 50 },
  highCost: { thresholdBps: 1_200, comparison: "greater_than", highCostCount: 1 }
};

const LOAN: Asset = {
  id: "33333333-3333-4333-8333-333333333333",
  userId: "user-a",
  kind: "loan_liability",
  name: "Car loan",
  openedAt: new Date("2026-01-01T00:00:00.000Z"),
  isClosed: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

function reset(): void {
  mocks.protection.current = NOT_CONFIGURED;
  mocks.protectionPending.current = false;
  mocks.debts.current = DEBT_PAGE;
  mocks.debtsPending.current = false;
  mocks.save.mockReset();
  mocks.create.mockReset();
  mocks.update.mockReset();
  mocks.toastSuccess.mockReset();
}

function renderPanel() {
  return render(
    <ProtectionDebtPanel
      initialProtection={mocks.protection.current}
      initialDebts={mocks.debts.current}
      initialAssets={[LOAN]}
      debtPageSize={50}
    />
  );
}

describe("ProtectionDebtPanel composition", () => {
  it("renders the server-loaded protection and debt data", () => {
    reset();
    renderPanel();

    expect(screen.getByText("Protection not recorded yet")).toBeVisible();
    expect(screen.getByText("Amex revolve")).toBeVisible();
    expect(screen.getByText("High cost")).toBeVisible();
  });

  it("always shows the sensitive-data and non-advisory notice", () => {
    reset();
    renderPanel();

    expect(
      screen.getByRole("region", { name: /What this section does, and does not, do/ })
    ).toBeVisible();
    expect(screen.getByText(/does not sell insurance, recommend a policy/)).toBeVisible();
    expect(
      screen.getByText(/never counted as an asset and never appears in your net worth/)
    ).toBeVisible();
  });

  it("shows a loading state before anything has loaded", () => {
    reset();
    mocks.protection.current = null;
    mocks.protectionPending.current = true;
    renderPanel();

    expect(screen.getByText(/Loading your protection and debt answers/)).toBeVisible();
  });

  it("keeps the protection form unavailable when the answers failed to load", () => {
    reset();
    mocks.protection.current = null;
    renderPanel();

    expect(
      screen.getByText(/protection form is unavailable until your answers load/)
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save protection answers" })).toBeNull();
  });

  it("labels the debt section as planning-only", () => {
    reset();
    renderPanel();

    expect(screen.getByText(/Nothing here posts a transaction, schedules a payment/)).toBeVisible();
  });
});

describe("ProtectionDebtPanel interactions", () => {
  it("opens the add-debt sheet from the section action", async () => {
    reset();
    const user = userEvent.setup();
    renderPanel();

    await user.click(first(screen.getAllByRole("button", { name: "Add a debt" })));

    expect(await screen.findByRole("heading", { name: "Add a debt" })).toBeVisible();
  });

  it("opens the resolve dialog for the chosen debt", async () => {
    reset();
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Resolve" }));

    expect(
      await screen.findByRole("heading", { name: /Remove “Amex revolve” from active planning\?/ })
    ).toBeVisible();
  });

  it("announces a resolution politely for screen readers", async () => {
    reset();
    mocks.update.mockResolvedValue({ ...DEBT, status: "resolved" });
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Resolve" }));
    await user.click(await screen.findByRole("button", { name: "Resolve debt record" }));

    const announcement = await screen.findByText(
      "Amex revolve removed from active planning checks."
    );
    await waitFor(() => expect(announcement).toHaveAttribute("aria-live", "polite"));
    expect(announcement).toHaveClass("sr-only");
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Amex revolve removed from active planning checks."
    );
  });

  it("offers only open loan liabilities when linking a new debt", async () => {
    reset();
    const user = userEvent.setup();
    renderPanel();

    await user.click(first(screen.getAllByRole("button", { name: "Add a debt" })));
    await user.click(await screen.findByRole("combobox", { name: "Linked loan liability" }));

    expect(screen.getByRole("option", { name: "Car loan" })).toBeVisible();
  });
});
