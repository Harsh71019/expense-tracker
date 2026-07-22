import type { AssetKind } from "@treasury-ops/shared";

export const assetKinds: readonly Readonly<{ value: AssetKind; label: string }>[] = [
  { value: "investment", label: "Investment" },
  { value: "fixed_deposit", label: "Fixed deposit" },
  { value: "gold", label: "Gold" },
  { value: "silver", label: "Silver" },
  { value: "loan_receivable", label: "Loan receivable" },
  { value: "loan_liability", label: "Loan liability" }
];

export function assetKindLabel(kind: AssetKind): string {
  return assetKinds.find((item) => item.value === kind)?.label ?? kind;
}

export function parseBasisPoints(value: string): number | undefined {
  const normalized = value.trim();
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(normalized)) return undefined;
  const [whole = "", fraction = ""] = normalized.split(".");
  const basisPoints = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isInteger(basisPoints) && basisPoints <= 10_000 ? basisPoints : undefined;
}

export function calendarDateInIndia(value: string): Date {
  return new Date(`${value}T00:00:00+05:30`);
}
