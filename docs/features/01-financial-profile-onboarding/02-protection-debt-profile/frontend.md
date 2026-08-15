# Protection and Debt Profile — Frontend Plan

## Experience

Provide two short checklists: protection and high-cost debt. Explain that employer cover may end with employment and that the app records facts rather than selling or selecting policies. Let users choose “not sure” so missing information remains visible instead of being interpreted as safe.

## Components

- `ProtectionProfileForm`: term cover, independent/employer source, health base/top-up, dependants, expiry.
- `DebtInventory`: active declared debts with linked-account and estimated badges.
- `DebtFormSheet`: kind, outstanding, rate, minimum payment, optional account link.
- `ProtectionDataNotice`: sensitive-data and non-advisory explanation.

## Files to create

- `apps/web/src/features/financial-profile/components/protection-profile-form.tsx`
- `apps/web/src/features/financial-profile/components/debt-inventory.tsx`
- `apps/web/src/features/financial-profile/components/debt-form-sheet.tsx`
- `apps/web/src/features/financial-profile/hooks/use-protection.ts`
- `apps/web/src/features/financial-profile/hooks/use-debt-profile.ts`
- `apps/web/src/features/financial-profile/model/protection-form.ts`
- Associated tests

## Files to edit

- `apps/web/src/features/financial-profile/index.ts`
- `apps/web/src/app/(app)/settings/settings-panel.tsx`
- Central query keys and generated client artifacts

## States and content

Show complete, incomplete, expiring, employer-only, no-debt-declared, and unknown states separately. Do not use a green “safe” badge when answers are missing. Rate entry displays percentage but converts through a validated basis-point helper. Destructive-looking actions archive/resolve metadata only and must not imply that debt was paid in the ledger.

## Tests

Cover optional/unknown answers, employer-only wording, rate conversion, linked-account selection, expired policy state, mutation error focus, mobile layout, and accessible descriptions for every checklist status.
