# Protection and Debt Profile — Frontend Plan

## Experience

Provide two short checklists: protection and high-cost debt. Explain that employer cover may end with employment and that the app records facts rather than selling or selecting policies. Let users choose “not sure” so missing information remains visible instead of being interpreted as safe.

## Components

- `ProtectionProfileForm`: term cover, independent/employer source, health base/top-up, dependants, expiry.
- `DebtInventory`: active declared debts with linked-asset and estimated badges.
- `DebtFormSheet`: kind, outstanding, rate, minimum payment, optional loan-liability link.
- `ProtectionDataNotice`: sensitive-data and non-advisory explanation.
- `ProtectionSummary`: the read side — per-cover state, amounts on file, and limitations.
- `ResolveDebtDialog`: confirms removing a debt from active planning checks.

### As implemented

The "optional account link" is a link to an existing open `loan_liability` **asset** (see
the backend plan's deviation note); the selector is filtered from the existing
`GET /v1/assets` response rather than adding a route. A linked debt shows no editable
amount at all — the sheet replaces the amount field with an explanation that the number
comes from the asset's latest valuation.

`ProtectionDebtPanel` composes these into the Settings `protection` tab
("Protection & Debt"), served by the `getProtectionState` / `getDeclaredDebtPage` server
loaders. The existing "Salary & Work" tab is untouched.

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

As implemented, no coverage state uses a success/green badge at all — even a fully
recorded answer is a neutral "Recorded", because holding cover is not the same as holding
enough cover, and adequacy is out of scope for this feature. Resolve copy says the debt is
removed from active planning checks and states explicitly that nothing is paid and net
worth is unaffected.

## Tests

Cover optional/unknown answers, employer-only wording, rate conversion, linked-account selection, expired policy state, mutation error focus, mobile layout, and accessible descriptions for every checklist status.
