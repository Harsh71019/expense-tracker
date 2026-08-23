import type { FinancialDiagnosticActionKey } from "@treasury-ops/shared";

export interface DiagnosticActionConfig {
  readonly key: FinancialDiagnosticActionKey;
  readonly label: string;
  readonly href: string;
  readonly description: string;
  readonly stepIndex: number;
}

/**
 * Server-authoritative action key to internal application route map.
 *
 * Security requirement (CLAUDE.md & AGENTS.md):
 * - Hardcoded, static, type-safe route mapping.
 * - Client NEVER accepts or navigates to arbitrary URLs or protocols from an API response.
 */
export const DIAGNOSTIC_ACTION_MAP: Record<FinancialDiagnosticActionKey, DiagnosticActionConfig> = {
  configure_salary: {
    key: "configure_salary",
    label: "Configure Salary & Schedule",
    href: "/settings?tab=income",
    description:
      "Set your net monthly salary and working hours to unlock life-hour metrics and goal feasibility.",
    stepIndex: 0
  },
  create_account: {
    key: "create_account",
    label: "Add Bank or Cash Account",
    href: "/accounts",
    description:
      "Set up checking, savings, or cash accounts to track real balances beyond credit cards.",
    stepIndex: 1
  },
  review_categories: {
    key: "review_categories",
    label: "Classify Essential Categories",
    href: "/categories",
    description:
      "Classify your recurring non-negotiable living expenses (groceries, utilities, rent) as essential.",
    stepIndex: 2
  },
  review_transactions: {
    key: "review_transactions",
    label: "Record 3 Months of Expenses",
    href: "/transactions",
    description:
      "Import or log 3 complete calendar months of essential expenses to establish your burn baseline.",
    stepIndex: 3
  },
  configure_protection: {
    key: "configure_protection",
    label: "Set Up Protection Profile",
    href: "/settings?tab=protection",
    description:
      "Declare your term life and health insurance covers to evaluate safety ladder readiness.",
    stepIndex: 4
  },
  review_debts: {
    key: "review_debts",
    label: "Review Debt Inventory",
    href: "/settings?tab=protection",
    description:
      "Declare or link your loans and credit liabilities to flag high-cost interest burdens.",
    stepIndex: 5
  },
  configure_safety_buffer: {
    key: "configure_safety_buffer",
    label: "Configure Safety Buffer",
    href: "/goals?safety-buffer=open",
    description:
      "Define an explicit emergency reserve preference rather than using the default fallback policy.",
    stepIndex: 6
  },
  refresh_asset_valuations: {
    key: "refresh_asset_valuations",
    label: "Refresh Asset Valuations",
    href: "/assets",
    description: "Update valuations for assets that have missing or stale historical valuations.",
    stepIndex: 7
  },
  create_goal: {
    key: "create_goal",
    label: "Create a Goal",
    href: "/goals",
    description:
      "Create targeted financial milestones to test feasibility against your current savings rate.",
    stepIndex: 8
  },
  review_assets: {
    key: "review_assets",
    label: "Record Assets",
    href: "/assets",
    description:
      "Record investments, fixed deposits, gold, and properties to build your full balance sheet.",
    stepIndex: 9
  }
};

export function getDiagnosticActionConfig(
  actionKey: FinancialDiagnosticActionKey | null | undefined
): DiagnosticActionConfig | null {
  if (!actionKey) return null;
  return DIAGNOSTIC_ACTION_MAP[actionKey] ?? null;
}
