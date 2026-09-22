import type { SafetyActionKey } from "@treasury-ops/shared";

export interface SafetyActionConfig {
  readonly key: SafetyActionKey;
  readonly label: string;
  readonly href: string;
  readonly description: string;
}

/**
 * Server-authoritative Safety Evaluation action key to internal application
 * route map.
 *
 * Security requirement (CLAUDE.md & AGENTS.md): a hardcoded, static,
 * type-safe route mapping -- the client never navigates to an arbitrary URL
 * or protocol carried in an API response. `none` has no route: it means
 * there is nothing left to configure right now.
 */
export const SAFETY_ACTION_MAP: Record<SafetyActionKey, SafetyActionConfig | null> = {
  configure_salary: {
    key: "configure_salary",
    label: "Configure salary & schedule",
    href: "/settings?tab=income",
    description: "Add your net monthly salary so protection and runway can be evaluated."
  },
  configure_protection: {
    key: "configure_protection",
    label: "Set up protection profile",
    href: "/settings?tab=protection",
    description: "Declare your term life and health insurance cover."
  },
  review_debts: {
    key: "review_debts",
    label: "Review debt inventory",
    href: "/settings?tab=protection",
    description: "Resolve or reassess high-cost debt before it can count as clean."
  },
  review_categories: {
    key: "review_categories",
    label: "Classify essential categories",
    href: "/categories",
    description: "Classify recurring non-negotiable spending as essential so burn is accurate."
  },
  review_transactions: {
    key: "review_transactions",
    label: "Record more expense history",
    href: "/transactions",
    description:
      "Log more complete months of essential expenses to reduce the estimate's uncertainty."
  },
  configure_reserves: {
    key: "configure_reserves",
    label: "Classify emergency reserves",
    href: "/settings?tab=reserves",
    description: "Choose which accounts and assets count toward your eligible emergency reserves."
  },
  refresh_asset_valuations: {
    key: "refresh_asset_valuations",
    label: "Refresh asset valuations",
    href: "/assets",
    description: "Update stale or missing valuations on assets configured as reserves."
  },
  configure_safety_buffer: {
    key: "configure_safety_buffer",
    label: "Configure safety buffer",
    href: "/goals?safety-buffer=open",
    description: "Set an explicit emergency-fund target instead of the six-month policy default."
  },
  none: null
};

export function getSafetyActionConfig(
  actionKey: SafetyActionKey | null | undefined
): SafetyActionConfig | null {
  if (!actionKey) return null;
  return SAFETY_ACTION_MAP[actionKey];
}
