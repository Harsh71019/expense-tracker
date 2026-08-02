# Frontend Bug & Quality Audit — `apps/web`

This document details the folder-by-folder audit of the `apps/web` frontend application in TreasuryOps Expense Tracker. All findings preserve existing business rules (integer paise, double-entry append-only ledger, strict TypeScript, server components by default).

---

## Folder-by-Folder Audit Findings

### 1. `apps/web/src/app`
- **`app/global-error.tsx` & `app/error.tsx`**:
  - **Bug**: `Sentry.captureException(...)` returns `string` when initialized, but if Sentry is uninitialized, mocked, or returns `undefined`, calling `eventId.slice(0, 6)` throws a runtime `TypeError` (`Cannot read properties of undefined (reading 'slice')`) inside the root error boundaries.
  - **Fix**: Use optional chaining/null check (`typeof eventId === "string" ? eventId.slice(0, 6) : null`).

### 2. `apps/web/src/lib`
- **`lib/errors.ts`**:
  - **Bug**: `import type { ProblemFieldError } from "@treasury-ops/shared";` is placed at the very bottom of the file (line 81) after usage on line 41 in `ValidationError`, breaking standard ESM import organization.
  - **Fix**: Move the import to the top of `lib/errors.ts`.

### 3. `apps/web/src/components/ui`
- **`components/ui/amount-input/amount-input.tsx`**:
  - **Bug**: Uses `new Function` to evaluate math expressions in client-side code. This fails under standard CSP (Content Security Policy) rules prohibiting `unsafe-eval`.
  - **Fix**: Replace `new Function` with a safe, tokenized basic arithmetic evaluator (supporting `+`, `-`, `*`, `/`, `()`) without dynamic string evaluation.

### 4. `apps/web/src/features/export`
- **`features/export/components/export-csv-form.tsx`**:
  - **Bug**: Radio buttons for selecting date range mode ("All posted transactions" vs "Choose a range") are missing `name="date-range-mode"` attribute.
  - **Fix**: Add `name="date-range-mode"` to form radio inputs for proper HTML radio group accessibility & keyboard arrow navigation.

### 5. `apps/web/src/features/recurring`
- **`features/recurring/components/recurring-rule-drawer.tsx`**:
  - **Bug 1**: `onChange` handlers for numeric inputs (`interval` and `count`) use `event.target.valueAsNumber` directly. When cleared, `valueAsNumber` is `NaN`, putting `NaN` into component state and causing Zod validation errors.
  - **Fix 1**: Guard `valueAsNumber` with `Number.isNaN(val) ? 1 : val`.
  - **Bug 2**: `weekdayLabels` maps both Tuesday (`TU`) and Thursday (`TH`) to `"T"`, and both Saturday (`SA`) and Sunday (`SU`) to `"S"`, creating visual ambiguity in schedule controls.
  - **Fix 2**: Update `weekdayLabels` to clear short labels (`"M"`, `"Tu"`, `"W"`, `"Th"`, `"F"`, `"Sa"`, `"Su"`).

### 6. `apps/web/src/features/budgets`
- **`features/budgets/components/budget-form.tsx`**:
  - **Bug**: Form submission reads `inputRef.current?.value` directly. If the user typed an expression like `500+200` without blurring first, `parseMinor` fails on raw expression text.
  - **Fix**: Pass the input through `evaluateMathExpression` before `parseMinor`.

### 7. `apps/web/src/features/transfers`
- **`features/transfers/components/create-transfer-sheet.tsx` & `features/transfers/hooks/use-transfers.ts`**:
  - **Bug**: `CreateTransferSheet` does not manage a per-mount idempotency UUID key like `CreateTxnSheet` does, and `useReverseTransfer` lacks an idempotency key header for transfer reversal POST requests.
  - **Fix**: Add mount-generated idempotency key in `CreateTransferSheet` and pass it to `useCreateTransfer`; accept idempotency key in transfer reversal when invoked.

### 8. `apps/web/src/features/transactions`
- **`features/transactions/components/txn-filters.tsx`**:
  - **Bug**: Global `Escape` keydown handler fires whenever `isFiltered` is true without checking if `event.defaultPrevented` or an interactive input/modal is focused, causing unexpected navigation to `/transactions` when dismissing modals or dropdowns.
  - **Fix**: Check `event.defaultPrevented` and ignore keydown when active element is inside an open dialog/drawer or input element.

### 9. `apps/web/src/features/dashboard`
- **`features/dashboard/components/cash-flow-chart.tsx`**:
  - **Bug**: SVG text nodes use `key={bucket.label}`. If multiple buckets share identical or empty labels in custom views, React emits duplicate key warnings.
  - **Fix**: Use unique `key={`cashflow-label-${bucket.label}-${index}`}`.

---

## Plan of Action & Verification
1. Create git worktree branch `fix/frontend-bugs`.
2. Implement fixes folder by folder without altering business logic.
3. Run `pnpm typecheck`, `pnpm lint`, and `pnpm test` across `apps/web`.
