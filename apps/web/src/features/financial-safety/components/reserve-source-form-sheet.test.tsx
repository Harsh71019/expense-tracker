import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReserveSource } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { ReserveSourceFormSheet } from "./reserve-source-form-sheet";

const ASOF = new Date("2026-08-18T00:00:00.000Z");

function eligibleAccount(overrides: Partial<ReserveSource> = {}): ReserveSource {
  return {
    sourceKind: "account",
    sourceId: "11111111-1111-4111-8111-111111111111",
    displayName: "HDFC Savings",
    sourceType: "bank",
    configuration: {
      liquidityTier: "instant",
      isIncluded: true,
      eligibleCapMinor: null,
      effectiveFrom: ASOF,
      configuredAt: ASOF
    },
    currentValueMinor: 100_000,
    valuedAt: null,
    freshness: "not_applicable",
    eligibleMinor: 100_000,
    eligibility: "eligible",
    exclusionReason: "none",
    isUnavailable: false,
    lastUpdatedAt: ASOF,
    ...overrides
  };
}

const mutateAsync = vi.fn().mockResolvedValue(eligibleAccount());
vi.mock("../hooks/use-update-reserve-source", () => ({
  useUpdateReserveSource: () => ({
    mutateAsync,
    isPending: false,
    idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  })
}));

describe("ReserveSourceFormSheet", () => {
  it("requires a second confirmation before removing the only currently eligible source", async () => {
    const source = eligibleAccount();
    const onSaved = vi.fn();
    render(
      <ReserveSourceFormSheet
        source={source}
        allSources={[source]}
        onClose={vi.fn()}
        onSaved={onSaved}
      />
    );

    fireEvent.click(screen.getByLabelText("Include this source as an emergency reserve"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText(/leave you with no eligible emergency reserve/i)
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm and save" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(onSaved).toHaveBeenCalled();
  });

  it("saves immediately, without a confirmation step, when another eligible source remains", async () => {
    const source = eligibleAccount();
    const other = eligibleAccount({ sourceId: "22222222-2222-4222-8222-222222222222" });
    const onSaved = vi.fn();
    render(
      <ReserveSourceFormSheet
        source={source}
        allSources={[source, other]}
        onClose={vi.fn()}
        onSaved={onSaved}
      />
    );

    fireEvent.click(screen.getByLabelText("Include this source as an emergency reserve"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(
      screen.queryByText(/leave you with no eligible emergency reserve/i)
    ).not.toBeInTheDocument();
  });

  it("does not shame the user in the confirmation copy", async () => {
    const source = eligibleAccount();
    render(
      <ReserveSourceFormSheet
        source={source}
        allSources={[source]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText("Include this source as an emergency reserve"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const warning = await screen.findByRole("alert");
    expect(warning.textContent?.toLowerCase()).not.toMatch(/bad idea|mistake|shouldn't|wrong/);
  });

  it("shows an explanation instead of a form for a structurally unsupported source", () => {
    const source = eligibleAccount({
      sourceType: "credit_card",
      configuration: null,
      eligibility: "ineligible",
      eligibleMinor: 0,
      exclusionReason: "unsupported_account_type"
    });
    render(
      <ReserveSourceFormSheet
        source={source}
        allSources={[source]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.getByText(/cannot be classified as an emergency reserve/i)).toBeInTheDocument();
  });

  it("labels the close button for screen readers", () => {
    const source = eligibleAccount();
    render(
      <ReserveSourceFormSheet
        source={source}
        allSources={[source]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Close reserve classification form")).toBeInTheDocument();
  });
});
