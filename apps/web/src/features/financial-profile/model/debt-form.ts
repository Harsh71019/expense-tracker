import {
  CreateDeclaredDebtSchema,
  HIGH_COST_DEBT_ANNUAL_RATE_BPS,
  MAX_DEBT_ANNUAL_RATE_BPS,
  type Asset,
  type CreateDeclaredDebt,
  type DeclaredDebtKind
} from "@treasury-ops/shared";

import { percentToBps, type ParseResult } from "./salary-form";

/**
 * @file Pure form transforms for declared debts.
 *
 * Rates are typed as a percentage because that is how a card statement prints
 * them, and converted here — once, validated — into the integer basis points
 * the API stores. No component multiplies a rate by 100 inline.
 */

export type DebtFormValues = Readonly<{
  name: string;
  kind: DeclaredDebtKind;
  /** Empty when the debt links to an asset; the amount is derived there. */
  declaredOutstandingMinor: number;
  annualRatePercent: string;
  minimumPaymentMinor: number;
  /** Empty string means "not linked". */
  linkedAssetId: string;
}>;

export const DEBT_KIND_OPTIONS: readonly Readonly<{ value: DeclaredDebtKind; label: string }>[] = [
  { value: "credit_card", label: "Credit card" },
  { value: "bnpl", label: "Buy now, pay later" },
  { value: "personal_loan", label: "Personal loan" },
  { value: "consumer_loan", label: "Consumer / vehicle loan" },
  { value: "other", label: "Other" }
];

export const DEBT_KIND_LABELS: Readonly<Record<DeclaredDebtKind, string>> = {
  credit_card: "Credit card",
  bnpl: "Buy now, pay later",
  personal_loan: "Personal loan",
  consumer_loan: "Consumer / vehicle loan",
  other: "Other"
};

export function emptyDebtFormValues(): DebtFormValues {
  return {
    name: "",
    kind: "credit_card",
    declaredOutstandingMinor: 0,
    annualRatePercent: "",
    minimumPaymentMinor: 0,
    linkedAssetId: ""
  };
}

/** Only open loan liabilities may back a declared debt. */
export function linkableAssets(assets: readonly Asset[]): Asset[] {
  return assets.filter((asset) => asset.kind === "loan_liability" && !asset.isClosed);
}

/** Basis points → a display percentage. Display only; never fed back into a calculation. */
export function bpsToPercentLabel(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const fraction = Math.abs(bps % 100);
  return fraction === 0 ? `${whole}%` : `${whole}.${String(fraction).padStart(2, "0")}%`;
}

/** The threshold as a label, derived from the shared constant rather than typed as "12%". */
export function highCostThresholdLabel(
  thresholdBps: number = HIGH_COST_DEBT_ANNUAL_RATE_BPS
): string {
  return bpsToPercentLabel(thresholdBps);
}

/**
 * Validates the debt form and converts it into the canonical POST body. A
 * linked debt sends no outstanding amount at all: that number comes from the
 * asset's latest valuation, and sending a second copy would be the start of a
 * drift bug.
 */
export function parseDebtForm(values: DebtFormValues): ParseResult<CreateDeclaredDebt> {
  const errors: Record<string, string> = {};
  const linked = values.linkedAssetId.trim() !== "";

  if (values.name.trim() === "") {
    errors["debt-name"] = "Give this debt a name you will recognise.";
  }

  let annualRateBps = 0;
  const rate = values.annualRatePercent.trim();
  if (rate === "") {
    errors["debt-rate"] = "Enter the annual interest rate, for example 42.";
  } else {
    try {
      annualRateBps = percentToBps(rate);
      if (annualRateBps > MAX_DEBT_ANNUAL_RATE_BPS) {
        errors["debt-rate"] = "That rate is higher than this app supports.";
      }
    } catch {
      errors["debt-rate"] = "Rate must be a percentage with at most two decimals, e.g. 42.5.";
    }
  }

  if (!linked && values.declaredOutstandingMinor <= 0) {
    errors["debt-outstanding"] = "Enter the outstanding amount, or link a loan liability instead.";
  }

  if (Object.keys(errors).length === 0) {
    const parsed = CreateDeclaredDebtSchema.safeParse({
      name: values.name.trim(),
      kind: values.kind,
      declaredOutstandingMinor: linked ? null : values.declaredOutstandingMinor,
      annualRateBps,
      minimumPaymentMinor: values.minimumPaymentMinor > 0 ? values.minimumPaymentMinor : null,
      linkedAssetId: linked ? values.linkedAssetId : null
    });
    if (parsed.success) return { ok: true, value: parsed.data };

    for (const issue of parsed.error.issues) {
      const fieldId = DEBT_FIELD_IDS[String(issue.path[0])] ?? "debt-name";
      errors[fieldId] ??= issue.message;
    }
  }

  return { ok: false, errors, firstFieldId: firstFieldId(errors, DEBT_FIELD_ORDER) };
}

const DEBT_FIELD_IDS: Readonly<Record<string, string>> = {
  name: "debt-name",
  kind: "debt-kind",
  declaredOutstandingMinor: "debt-outstanding",
  annualRateBps: "debt-rate",
  minimumPaymentMinor: "debt-minimum-payment",
  linkedAssetId: "debt-linked-asset"
};

const DEBT_FIELD_ORDER = [
  "debt-name",
  "debt-kind",
  "debt-linked-asset",
  "debt-outstanding",
  "debt-rate",
  "debt-minimum-payment"
] as const;

function firstFieldId(errors: Readonly<Record<string, string>>, order: readonly string[]): string {
  return order.find((fieldId) => errors[fieldId] !== undefined) ?? order[0] ?? "";
}
