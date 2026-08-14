# Frontend standardization — apps/web

## Context

This is a design/plan only; implementation has not started. It follows a full-codebase audit of `apps/web` (22 features under `src/features/`) done in three parts — UI/visual consistency, data/state-layer consistency, and structural/naming/testing consistency — against the conventions already documented in `apps/web/CLAUDE.md`. The goal is to close the gap between what that doc _says_ the conventions are and what's actually in the code, and to fill in the handful of conventions that were never written down in the first place (overlay-component choice, stat-tile primitive, barrel-export rules for server fetchers).

`docs/reviews/vyaya-frontend-standards.md` is 2026-ecosystem _aspirational_ research (Zustand, nuqs, `HydrationBoundary`/`dehydrate`, etc.) — none of that is in `package.json` today and this plan does not assume it. This plan is grounded only in what the audit found actually in the repo.

## What's already consistent — do not touch

The audit confirmed these are solid across all (or nearly all) of the 22 features. Don't relitigate them; any work item below should be additive to these, not a rewrite:

- **Server fetchers** (`server/*.ts`): every checked feature wraps in `cache()`, uses `getServerApiClient()`, and `.safeParse()`s against a `@treasury-ops/shared` schema, failing closed (`null`/`[]`) rather than throwing. `export` and `auth` have no `server/` dir — correct, both are client-only flows.
- **Client hooks**: no ad hoc inline `queryKey` arrays anywhere — 100% use `qk.*` from `src/lib/query/keys.ts`. Mutations consistently `invalidateQueries` in `onSettled` (except `use-export-csv.ts`, which mutates nothing server-side — correct).
- **Error handling**: every hook throws through `toAppError`/`toNetworkError`; no raw error-swallowing or ad hoc `.status` checks found.
- **Idempotency keys**: present on every create-mutation hook except one (see P1).
- **Hook naming**: `use-*.ts` kebab-case, zero drift across all 22 features.
- **Test colocation**: 100% sibling `*.test.ts(x)` files, zero `__tests__/` directories — fully consistent, don't introduce the other pattern.
- **Route files**: `page.tsx` files are uniformly thin (7–63 lines), composition-only.
- **TypeScript hygiene**: no `any`, unsafe `as`, `enum`, or `!` found in `src/features`.
- **Icons**: lucide-react only, no stray SVG icon sources.
- **Money rendering**: no hand-formatted `amountMinor` found outside `<Money>`/`<SignedMoney>`/`formatMinor()`.
- **Overlay primitives**: all dialogs/sheets/drawers already build on the shared `DialogSurface` (`src/components/ui/dialog/dialog-surface.tsx`) — the problem is naming/usage-rule drift on top of a good primitive, not a missing one.

## Priority 0 — visual primitives (foundational, low risk, unblocks feature work)

### P0.1 Codify the overlay decision rule, kill the naming outlier

Finding: 15 files use `-dialog`, 7 use `-drawer`, 4 use `-sheet`, and exactly one file — `src/features/insights/components/create-account-modal.tsx` — uses `-modal`, all on top of the same `DialogSurface` primitive. There's no documented rule for which pattern maps to which use case (confirm vs. create vs. detail-view).

- Adopt this rule and add it to `apps/web/CLAUDE.md`:
  - `-dialog`: confirmations, small single-purpose actions (e.g. `reverse-confirm-dialog.tsx`).
  - `-sheet`: create/edit forms (e.g. `create-txn-sheet.tsx`).
  - `-drawer`: read-heavy detail views (e.g. `txn-detail-drawer.tsx`).
  - `-modal` is retired as a naming choice — always resolves to one of the above.
- Rename `create-account-modal.tsx` → `create-account-sheet.tsx` (it's a create form) and update its one call site.

### P0.2 Add a shared stat-tile/card primitive

Finding: no shared card/stat-tile primitive exists in `src/components/ui`. Of the five candidate implementations flagged by the audit (`dashboard/stat-cards.tsx`, `recurring/recurring-stats-cards.tsx`, `bills/bill-summary.tsx`, `profile/profile-summary.tsx`, `assets/asset-card.tsx`), closer inspection during implementation found they split into two genuinely different card genera, not one:

- **Glass floating tiles** (`dashboard/stat-cards.tsx`, `recurring/recurring-stats-cards.tsx`, `profile/profile-summary.tsx`) — all three already used or approximated the `glass-card` CSS utility (translucent, `backdrop-filter: blur`). These are the real duplicates and got unified.
- **Solid content cards** (`bills/bill-summary.tsx`, `assets/asset-card.tsx`) — opaque `bg-surface-elevated`, no blur, used as page-level detail headers / rich entity rows, not floating stat tiles. Forcing `glass-card`'s translucency onto these would be a visual regression (reduced legibility over busy backgrounds), not a consistency win — so they were deliberately left out of this primitive rather than shoehorned in.

Implemented: `src/components/ui/stat-card/stat-card.tsx` exports `StatCard` (the `glass-card`/`glass-card-hover` shell, with `padding` variants `xs`/`sm`/`md` to match each caller's existing spacing without fighting Tailwind's class-order cascade) plus `StatCardLabel` and `StatCardValue` (the uppercase mono label/value typography that was duplicated near-verbatim across all three). Migrated `dashboard/stat-cards.tsx`, `recurring/recurring-stats-cards.tsx`, `profile/profile-summary.tsx`. `bill-summary.tsx`/`asset-card.tsx` are intentionally unchanged beyond the P0.4 text-token sweep — if a "solid detail card" duplication problem is found there later, it should get its own primitive, not reuse `StatCard`.

### P0.3 Adopt the shared `Skeleton` component everywhere loading state is needed

Finding turned out to be a false positive on closer inspection: the `animate-pulse` divs in `account-manager.tsx:256` and `recurring-manager.tsx:140` are not hand-rolled loading skeletons at all — they're small live/status pulse-dots (`h-1.5 w-1.5 rounded-full bg-accent animate-pulse`), the same pattern `Badge`'s `pulse` prop already uses. Neither component ever needs a loading skeleton in the first place: both are SSR-seeded (`useAccounts(initialAccounts)` / `useRecurringRules(initialRules)`, falling back to the SSR-provided array via `.data ?? initial...`), so there's never an undefined-data render state to placeholder.

Verified more broadly: every component in `src/features/*` with an `isLoading`/`.data === undefined` branch already renders `Skeleton`. No code change needed here — the audit's specific file-level claim didn't hold up, and the broader "likely gaps" it flagged as unconfirmed turned out not to exist either.

### P0.4 Add a micro/label text-size token; stop hand-rolling arbitrary pixel sizes

Finding: `text-[9px]`, `text-[10px]`, `text-[11px]` (Tailwind arbitrary values) appear in ~15 files (`txn-detail-drawer.tsx`, `account-manager.tsx`, `recurring-rule-drawer.tsx`, `create-category-sheet.tsx`, others) — this is everyone routing around a missing "micro" or "label" step in the type scale by hand.

- Add one token (e.g. `text-2xs` at 10px, or whatever value is the actual mode across the ~15 sites — check before picking) to the Tailwind theme config.
- Sweep and replace the arbitrary-value occurrences with the new token. This is mechanical, low-risk, high file-count — good candidate for a single dedicated PR.

### P0.5 Cleanup: one stray hardcoded hex

Finding was also a false positive on inspection: `create-category-sheet.tsx:382`'s `#2563EB` is a `placeholder` attribute value on a "Custom hex" text input (where a user types their own category color) — legitimate example content for a hex-color field, not a styling literal that should be a token. No change made. The other hardcoded-hex hits (`categories/model/palette.ts`, `assets/model/asset-visuals.ts`, `dashboard/spend-mix-panel.tsx`, `reports/model/rollup-category.ts`, `accent-preference-form.tsx`) are legitimate fixed data-viz/category palettes and correctly stay as-is — none of the hardcoded-hex findings in this audit turned out to be real theme-token violations.

## Priority 1 — data-layer & structural correctness

### P1.1 Fix the idempotency gap on API key creation — done

Root cause confirmed and fixed at the source: `apps/api/src/openapi/registry.ts`'s `/v1/api-keys` POST registration never declared `headers: idempotencyKeyHeaders` (unlike `/v1/accounts`, which does) — that's what produced the generated client's `header?: never`, not a backend controller gap per se.

Implemented, matching the `/v1/accounts` create-route shape exactly:

- `apps/api/src/api-keys/api-keys.service.ts`: `ApiKeysService.create` now takes a `key: string` and wraps the Better Auth plugin call in `IdempotencyPostgresService.execute(userId, "api-key.create", key, input, CreateApiKeyResponseSchema, ...)`, returning `IdempotentResult<CreateApiKeyResponse>`.
- `apps/api/src/api-keys/api-keys.controller.ts`: reads `Idempotency-Key` via `@Headers()`, validates with the same `z.string().uuid()` schema every other create route uses, sets `Idempotency-Replayed: true` + 200 on replay.
- `apps/api/src/openapi/registry.ts`: added `headers: idempotencyKeyHeaders` and the 200/409 replay/conflict responses to the `POST /v1/api-keys` registration.
- Regenerated `apps/api/openapi.json` and `apps/web/src/lib/api/generated/schema.d.ts` via `pnpm gen:client`.
- `apps/web/src/features/api-keys/hooks/use-api-keys.ts`: `useCreateApiKey` now generates and sends the header, rotating the key on success — identical shape to `useCreateAccount`.
- Updated the api-keys unit tests, controller tests, integration test, and the frontend hook test for the new signature/assertions. All green (api unit: 905/905, api integration: 274/274, web unit: 855/855).

Note for reviewers: this reuses the codebase's standard idempotency wrapper, which persists the full response — including the plaintext API key secret — in the `idempotency_records` table for the standard 30-day retention window, same as it already does for other sensitive fields (e.g. transaction descriptions) elsewhere in the app. This matches existing accepted practice rather than introducing a new pattern, but is worth a conscious sign-off given it's a secret, not just sensitive data.

### P1.2 Add missing `index.ts` barrels — done, and one finding corrected

Finding was half accurate: `net-worth` already had an `index.ts` (exporting `useNetWorth`) — the audit's claim it had none didn't hold up. Only `pending-transactions` genuinely lacked one.

Implemented: added `apps/web/src/features/pending-transactions/index.ts` exporting `PendingTransactionsPanel` (the only client-safe export; `getPendingTransactions` stays out per the barrel rule below). Updated `src/app/(app)/transactions/page.tsx` to import `PendingTransactionsPanel` from the barrel instead of its component file directly, and fixed the corresponding `vi.mock` path in `src/app/routes.test.tsx`.

### P1.3 Decide and document the server-fetcher barrel-export rule — done

Finding: `imports/index.ts` and `reports/index.ts` were the only two barrels re-exporting their `server/*.ts` fetcher. Investigating _why_ before writing a rule: neither re-export turned out to be load-bearing. `getImportBatches` is re-exported from `imports/index.ts`, but `imports/page.tsx` — the only consumer — deep-imports it directly anyway, ignoring its own barrel. `getMonthlyRollup` is re-exported from `reports/index.ts` and _was_ consumed via that barrel by `reports/page.tsx`, but `categories/page.tsx` (a different feature, reusing reports' fetcher) already deep-imports it directly — so the barrel path was never the only way in.

Given neither exception was actually necessary, normalized instead of documenting them as sanctioned: removed both re-exports, switched `reports/page.tsx` to deep-import `getMonthlyRollup` like every other route file, and updated the one affected `vi.mock` in `routes.test.tsx`. The rule is now 100% consistent with no exceptions, and codified in `apps/web/CLAUDE.md`'s architecture section: server fetchers are never re-exported from a feature's `index.ts`; route files always deep-import them, even from that fetcher's own feature.

### P1.4 Stop `quick-add` from re-implementing sibling hooks — done

Finding confirmed: `quick-add/hooks/use-accounts.ts`, `use-categories.ts`, `use-create-account.ts` were each a one-line re-export shim pointing at `accounts/hooks/*` / `categories/hooks/*` directly, bypassing those features' own barrels.

Implemented: deleted all three shim files. `quick-add/components/quick-add-form.tsx` and `account-setup.tsx` now import `useAccounts`/`useCategories`/`useCreateAccount` straight from `@/features/accounts` and `@/features/categories`. Also removed `quick-add/index.ts`'s re-export of `useAccounts`/`useCategories` — nothing outside `quick-add` consumed them from there (only `useCreateTxn` and `QuickAddForm` have external consumers), so re-exporting another feature's hooks under `quick-add`'s own public surface was dead, and itself a small barrel-boundary smell. Updated the three affected test files' imports/`vi.mock` targets to match (`data-hooks.test.tsx`, `quick-add-form.test.tsx`, `account-setup.test.tsx`) — left their test _content_ untouched since the finding was about the import path, not test coverage.

### P1.5 Backfill `model/*.ts` for inline schema validation — done

Finding confirmed at all 5 sites. Implemented, one new `model/` file per feature (two for `quick-add`, since `quick-add-form.tsx` and `account-setup.tsx` validate unrelated things):

- `accounts/model/account-form.ts` — `parseCreateAccountInput`, `parseCreditCardConfigInput`, used by `account-manager.tsx`.
- `category-rules/model/rule-form.ts` — `parseCreateCategoryRuleInput`, used by `category-rule-manager.tsx`.
- `transfers/model/transfer-form.ts` — `parseCreateTransferInput` plus the `fieldErrorName` helper that was already colocated in the component (also a pure function, belongs in `model/`), used by `create-transfer-sheet.tsx`.
- `quick-add/model/quick-add-form.ts` — `parseCreateTransactionInput` + `fieldErrorName`, used by `quick-add-form.tsx`.
- `quick-add/model/account-setup-form.ts` — `parseAccountSetupInput` + `parseAccountType` (the inline `AccountTypeSchema.safeParse` in the type `<Select>`'s `onChange`), used by `account-setup.tsx`.

One naming note for reviewers: zod v4 renamed `SafeParseReturnType<Input, Output>` to `ZodSafeParseResult<Output>` — every function above returns the latter. Full suite green after: web typecheck/lint clean, 855/855 unit tests.

### P1.6 Decide on `auth`'s thin structure — done

Confirmed correct: `login-form.tsx`/`sign-out-button.tsx` call `authClient.signIn.email(...)`/`authClient.signOut()` from `src/lib/auth/client.ts` (a `better-auth/react` wrapper) directly — there's no TanStack Query layer to split into `hooks/`, and no SSR fetch to split into `server/`. Documented as an intentional exception in `apps/web/CLAUDE.md`'s architecture section, right after the 5-layer list.

## Priority 2 — test coverage backfill

Finding (file-count ratios, not measured coverage): `net-worth` has **zero** test files against 3 source files. `export` has 1 test for 4 source files. `pending-transactions` and `profile` are thin (2 tests each). Contrast with `dashboard` (26/30), `insights` (9/10), `spending-warnings` (10/12), which are near 1:1.

Recall from memory: the repo's 90% `test:coverage` threshold is not CI-enforced and already fails globally on `main` — don't chase the global number. This section is about closing the worst per-feature gaps, not hitting 90%.

- `net-worth` — done. Added `hooks/use-net-worth.test.tsx` (seeds-from-initialData, refetch, API-error, and schema-validation-failure cases, mirroring `profile/hooks/use-profile.test.tsx`'s shape) and `server/get-net-worth.test.ts` (happy path + both fail-closed-to-`null` paths, mirroring `dashboard/server/get-stats.test.ts`). `net-worth/index.ts` is left untested, consistent with the rest of the codebase not unit-testing barrel re-exports.
- `export`, `pending-transactions`, `profile`: left as-is, lower priority — backfill opportunistically when touching those features for other reasons rather than as a dedicated sweep, per the original plan.

## Suggested sequencing

1. **P0.1 → P0.2 → P0.3 → P0.4 → P0.5** in order — each is small, mechanical, and low-risk; P0.2 benefits from P0.1's naming rule being settled first.
2. **P1.1** (idempotency/backend contract) can run in parallel with P0 — it touches a different layer entirely.
3. **P1.2 → P1.4** together (both are barrel-discipline fixes, touch adjacent files).
4. **P1.3, P1.5, P1.6** are cheap, can be slotted in anytime, no dependencies.
5. **P2** ongoing/opportunistic, except `net-worth` which should get dedicated attention once P0/P1 are through.

## Governance — keep this from drifting back

Once P0 and P1 land, fold the newly-codified rules into `apps/web/CLAUDE.md`'s Architecture section:

- The overlay dialog/sheet/drawer decision rule (P0.1).
- The stat-card primitive's existence and when to use it (P0.2).
- The server-fetcher barrel-export rule (P1.3).
- The `auth` feature's exception to the 5-layer convention (P1.6).

Without this, the next feature added will re-introduce the same drift this plan is closing.
