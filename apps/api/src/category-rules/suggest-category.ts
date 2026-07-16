import type { CategoryId, CategoryRule } from "@vyaya/shared";

/**
 * Rule-based category suggester (IMPLEMENTATION-PLAN.md Phase 3: "SWIGGY -> Food,
 * IRCTC -> Travel, user-editable rules collection") — case-insensitive substring
 * match of each rule's pattern against the description. When multiple rules
 * match, the longest (most specific) pattern wins, so a rule like "SWIGGY
 * INSTAMART" beats a broader "SWIGGY" rule on the same description.
 *
 * Kept as a pure function behind this one call site so a future
 * embedding-based classifier is a drop-in replacement, per the same
 * IMPLEMENTATION-PLAN.md line ("behind an interface so the future embedding
 * classifier is a drop-in").
 */
export function suggestCategory(
  description: string,
  rules: readonly CategoryRule[]
): CategoryId | undefined {
  const normalized = description.toLowerCase();
  const matches = rules.filter((rule) => normalized.includes(rule.pattern.toLowerCase()));
  if (matches.length === 0) return undefined;

  const longest = matches.reduce((best, candidate) =>
    candidate.pattern.length > best.pattern.length ? candidate : best
  );
  return longest.categoryId;
}
