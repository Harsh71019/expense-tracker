import type { AssetKind } from "@vyaya/shared";

export const ASSET_KIND_ORDER: readonly AssetKind[] = [
  "loan_receivable",
  "loan_liability",
  "fixed_deposit",
  "gold",
  "silver",
  "investment"
];

export const ASSET_KIND_ICON: Record<AssetKind, string> = {
  loan_receivable: "🤝",
  loan_liability: "📉",
  fixed_deposit: "🏦",
  gold: "🪙",
  silver: "⚪",
  investment: "📈"
};

export const ASSET_KIND_COLOR: Record<AssetKind, string> = {
  loan_receivable: "#3b82f6",
  loan_liability: "#f87171",
  fixed_deposit: "#34d399",
  gold: "#eab308",
  silver: "#94a3b8",
  investment: "#8b5cf6"
};

export const ASSET_KIND_FULL_LABEL: Record<AssetKind, string> = {
  loan_receivable: "Loan (owed to you)",
  loan_liability: "Loan (you owe)",
  fixed_deposit: "Fixed deposit",
  gold: "Gold",
  silver: "Silver",
  investment: "Investment"
};

export const ASSET_KIND_SHORT_LABEL: Record<AssetKind, string> = {
  loan_receivable: "Receivable",
  loan_liability: "Liability",
  fixed_deposit: "FD",
  gold: "Gold",
  silver: "Silver",
  investment: "Investment"
};

export function assetNamePlaceholder(kind: AssetKind): string {
  if (kind === "gold") return "e.g. Sovereign gold coins";
  if (kind === "silver") return "e.g. Silver bars";
  if (kind === "fixed_deposit") return "e.g. HDFC FD 2026";
  if (kind === "loan_receivable" || kind === "loan_liability") return "e.g. Loan to Rohan";
  return "e.g. Mutual fund SIP";
}
