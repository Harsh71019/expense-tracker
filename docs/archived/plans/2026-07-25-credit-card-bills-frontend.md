# Credit Card Bills — Frontend Implementation Plan

> This plan implements the frontend portion of
> [`2026-07-24-credit-card-bills-design.md`](./2026-07-24-credit-card-bills-design.md).
> It depends on the API contracts and generated client described in
> [`2026-07-25-credit-card-bills-backend.md`](./2026-07-25-credit-card-bills-backend.md).

**Goal:** Give the user a CRED-like flow to configure a card cycle, see upcoming/paid bills, upload
and reconcile the issuer CSV, resolve mismatches, and make an idempotent partial/full payment from
an existing bank/cash account.

**Architecture:** Add a `bills` feature slice with server loaders, TanStack Query hooks, pure view
models, and tested client components. `/bills` is the server-rendered list entry point;
`/bills/[billId]` hosts the statement/reconciliation/payment workflow. Account configuration stays
inside the existing account manager. All JSON requests use the generated `apiClient`; the multipart
request also goes through the generated endpoint with a `FormData` body serializer so no
hand-written endpoint fetch is introduced.

---

## 1. Prerequisites and constraints

- Complete the backend plan through OpenAPI/client generation first.
- Do not hand-write API response/request types. Import zod-derived types from
  `@treasury-ops/shared`.
- Runtime-parse every API response with its shared zod schema before placing it in query state.
- Server components use `getServerApiClient()` and fail closed to an empty/not-found state.
- Interactive components alone use `"use client"`.
- Every mutation owns an idempotency UUID created on component/hook mount and rotates it only after
  success. A retry after a network failure reuses the same UUID.
- Display money only through `Money`, `SignedMoney`, or shared `formatMinor()` utilities.
- Display calendar dates in `Asia/Kolkata`; do not use browser-local month/day math.
- Reuse existing `Button`, `Input`, `AmountInput`, `EmptyState`, surface, dialog, and typography
  patterns. Do not add a UI dependency.
- New UI and hooks require tests sufficient to preserve the web package's 90% coverage gate.

---

## 2. Routes and primary user flow

### `/bills`

- SSR-load the first cursor page.
- Header shows total outstanding and next due bill.
- Filters: all cards, one card, awaiting statement/reconciled, unpaid/partial/paid.
- Bill cards show card name, cycle, due date, statement state, payment state, due/paid/remaining
  money, and the next required action.
- Selecting a card opens `/bills/[billId]`.
- Empty state distinguishes “no credit cards configured” from “no generated bills yet.”

### `/bills/[billId]`

One responsive page with a visible lifecycle:

1. Bill summary and immutable cycle amount.
2. Upload issuer CSV and map columns.
3. Worker-processing state with polling.
4. Reconciliation summary and row review.
5. Resolve/acknowledge discrepancies.
6. Reconcile the statement.
7. Pay remaining amount from an eligible account.

The UI never marks a bill reconciled or paid optimistically. It waits for the parsed API response,
then invalidates/refetches authoritative bill/account/transaction data.

---

## 3. Feature file layout

Create:

```text
apps/web/src/features/bills/
  components/
    bill-list.tsx
    bill-card.tsx
    bill-filters.tsx
    bill-detail.tsx
    bill-summary.tsx
    bill-lifecycle.tsx
    statement-upload-step.tsx
    statement-mapping-step.tsx
    reconciliation-summary.tsx
    reconciliation-table.tsx
    reconciliation-row.tsx
    extra-ledger-list.tsx
    reconcile-confirm-dialog.tsx
    pay-bill-sheet.tsx
  hooks/
    use-bills.ts
    use-bill-detail.ts
    use-bill-statement.ts
    use-bill-reconciliation.ts
    use-pay-bill.ts
  model/
    bill-filters.ts
    bill-presentation.ts
    reconciliation.ts
  server/
    get-bill-page.ts
    get-bill-detail.ts
  index.ts
```

Co-locate `.test.ts`/`.test.tsx` files beside each model, hook, and non-trivial component, following
the current feature conventions.

---

## 4. Query keys, server loaders, and pure models

### Files

- Modify `apps/web/src/lib/query/keys.ts`
- Create `apps/web/src/features/bills/server/get-bill-page.ts`
- Create `apps/web/src/features/bills/server/get-bill-detail.ts`
- Create model files/tests listed above

### Query keys

Add a single hierarchical root:

```text
bills()
billLists()
billList(filters)
billDetails()
billDetail(billId)
billStatementRows(billId, filters)
```

This allows payment/reconciliation to invalidate one bill detail plus every list without clearing
unrelated application data.

### Server loaders

- `getBillPage(query)` calls generated `GET /v1/bills`, parses `BillPageSchema`, and returns an empty
  page on a recoverable fetch/validation failure while logging only through `debug.api`.
- `getBillDetail(billId)` parses the UUID before the call, parses `BillDetailSchema` after the call,
  and returns `null` on `404`/invalid payload so the route can call `notFound()`.
- Use `cache()` only for request-local deduplication and the existing `noStoreFetch`.

### Pure presentation models

Implement/test:

- URL search-param parsing and serialization for list filters.
- Due-state label: overdue, due today, due in N days, paid.
- Next action: upload, processing, resolve, reconcile, pay, complete.
- Progress percent derived from integer `paidMinor/amountDueMinor`, clamped for display only.
- Status label/tone mapping.
- Reconciliation counts and whether the reconcile button can be enabled.
- Eligible payment account filtering: active, not the destination card, and only backend-approved
  source types.

Date helpers consume ISO/`Date` values and format with `Intl.DateTimeFormat(..., {
timeZone: "Asia/Kolkata" })`; they do not compute financial cycle boundaries.

---

## 5. Credit-card configuration in account management

### Files

- Modify `apps/web/src/features/accounts/components/account-manager.tsx`
- Modify its tests
- Modify `apps/web/src/features/accounts/hooks/use-create-account.ts`
- Create `apps/web/src/features/accounts/hooks/use-update-credit-card-config.ts`
- Create hook tests

### Create account

When `type === "credit_card"`:

- Show required statement-day and due-day number/select inputs.
- Explain the last-day clamp in helper text.
- Submit `creditCardConfig` inside the same `CreateAccountSchema` payload so account + configuration
  are one backend idempotent mutation.
- Reset both day fields when opening/closing the modal or changing away from credit card.
- Keep opening debt semantics (`owed` produces a negative opening balance) unchanged.

For non-card types, omit `creditCardConfig`; never send `undefined` keys that violate
`exactOptionalPropertyTypes`.

### Existing card configuration

Credit-card account cards show:

- statement day, due day, and next statement date when configured;
- a “Set billing cycle” action when legacy card data is unconfigured;
- an “Edit billing cycle” action otherwise.

The edit dialog uses `PATCH /v1/accounts/{accountId}/credit-card-config` with its own mounted
idempotency key. On success invalidate accounts, bill lists, and the affected bill detail, because
future generation metadata may change. Clearly state that existing bills are not recalculated.

Tests cover conditional rendering, schema errors, reset behavior, exact request payloads,
idempotency-key reuse/rotation, and non-card omission.

---

## 6. Bill list page

### Files

- Create `apps/web/src/app/(app)/bills/page.tsx`
- Create `apps/web/src/features/bills/components/bill-list.tsx`
- Create `bill-card.tsx`, `bill-filters.tsx`, and tests
- Create `apps/web/src/features/bills/hooks/use-bills.ts` and tests

### Server route

Parse search params through the shared/local filter model, load the first page on the server, and
pass it to the client list. Avoid a loading waterfall for the initial view.

### `useBills`

- Use `useInfiniteQuery` with the cursor returned by `pageInfo.nextCursor`.
- Call the generated endpoint with serialized filters.
- Parse every page with `BillPageSchema`.
- Keep previous data while filters change where it improves continuity, but show that a refresh is
  happening.

### List UI

Header summary:

- aggregate remaining due across loaded bills using integer addition;
- earliest unpaid due date;
- count requiring statement/reconciliation action.

Cards:

- `Money` for due/paid/remaining;
- card/account name and cycle;
- due label and status badges;
- progress bar with accessible text;
- CTA determined by next-action model;
- skeleton/refresh/error/load-more/empty states.

Do not pretend loaded pages represent all-time totals. If the backend detail/list response does not
include aggregate totals, label the summary “shown bills” or add a backend aggregate contract
before implementation.

---

## 7. Bill detail shell and lifecycle

### Files

- Create `apps/web/src/app/(app)/bills/[billId]/page.tsx`
- Create `apps/web/src/features/bills/components/bill-detail.tsx`
- Create summary/lifecycle components and tests
- Create `apps/web/src/features/bills/hooks/use-bill-detail.ts` and tests

The server page validates `billId`, loads bill detail and accounts in parallel, and calls
`notFound()` when the bill is unavailable to the current user.

`BillDetail`:

- hydrates TanStack Query with the server result;
- renders account, cycle, due date, due/paid/remaining, payment state, and reconciliation state;
- shows a four-stage lifecycle: statement → review → reconciled → paid;
- keeps historical completed steps readable;
- never allows client state alone to advance a server-controlled stage.

Polling:

- while the active upload is `pending`, refetch detail at a bounded interval (for example 2 seconds);
- stop polling on `staged`, `failed`, unmount, or network error backoff;
- expose retry/re-upload after `failed`;
- do not poll bills that have no pending upload.

---

## 8. Shared CSV mapping UI and typed multipart upload

### Files

- Extract/create `apps/web/src/components/csv/column-mapping-form.tsx`
- Modify `apps/web/src/features/imports/components/map-step.tsx` to use it
- Preserve/extend import tests
- Create statement upload/mapping components and tests
- Create `apps/web/src/features/bills/hooks/use-bill-statement.ts` and tests

Extract only generic mapping controls and header preview from the import wizard. Import-specific
saved-mapping hooks and copy stay in the imports feature. Bills pass their own current mapping and
change callback.

Upload flow:

1. Accept `.csv` only and show the 5 MB limit.
2. Read headers locally for mapping UI only; the backend remains authoritative.
3. Parse mapping with `ColumnMappingSchema`.
4. Build `FormData` with `file` and JSON `mapping`.
5. Call the generated `apiClient.POST("/v1/bills/{billId}/statement", ...)` endpoint and supply a
   `bodySerializer` that returns the `FormData`. If the generated binary field is represented as a
   string, pass a schema-valid placeholder in the typed body and let the serializer append the real
   `File`; do not cast the request or fall back to a hand-written `fetch`.
6. Send the mounted `Idempotency-Key` through the generated header params.
7. Parse `BillStatementUploadSchema`.
8. Rotate the key only on success and invalidate detail/rows.

Client checks improve feedback but never replace server MIME/size/row validation.

---

## 9. Reconciliation review

### Files

- Create reconciliation components/models/tests
- Create `apps/web/src/features/bills/hooks/use-bill-reconciliation.ts` and tests

### Row query

- Infinite/cursor query of the active upload's rows.
- Optional status filter: all, matched, missing, ambiguous, acknowledged.
- Runtime-parse every page.
- Reset pagination when bill/upload/filter changes.

### Summary

Show:

- total rows;
- matched;
- missing from ledger;
- ambiguous;
- acknowledged discrepancies;
- extra ledger transactions;
- whether the hard gate currently passes.

### Row behavior

- Matched: issuer row plus linked ledger transaction.
- Missing: allow explicit acknowledgement with explanatory confirmation.
- Ambiguous: show candidate selector/manual match dialog; never silently pick one in the browser.
- Parse failure: raw cells plus parse problems and acknowledgement option.
- Manual override submits a transaction ID only; the backend revalidates ownership/cycle/type/amount.
- Disable only the row currently mutating, not the entire table.
- Announce success/failure using `sonner` and preserve server error detail where safe.

### Extra ledger rows

Render warnings separately from issuer rows. Allow reviewed/unreviewed toggling through the
acknowledge-extra endpoint, but explain that these warnings do not block reconciliation in v1.

Every patch/acknowledgement hook:

- has a mounted idempotency key scoped to the current form/action;
- parses its response;
- rotates the key after success;
- invalidates row pages, bill detail, and bill lists.

---

## 10. Reconcile action

### Files

- Create `reconcile-confirm-dialog.tsx` and tests
- Extend reconciliation hook tests

The reconcile CTA:

- is disabled while upload processing or unresolved unacknowledged rows remain;
- opens a confirmation summarizing matched, acknowledged, and extra counts;
- sends `POST /v1/bills/{billId}/statement/reconcile` with a mounted idempotency key;
- handles a server `409` by refetching rows/detail, because another tab or stale page may have
  changed the gate;
- moves the lifecycle only after parsing the returned `BillDetail`;
- invalidates bill detail and lists.

Once reconciled, upload, match, and acknowledgement controls become read-only. The statement review
remains visible as history.

---

## 11. Payment sheet

### Files

- Create `apps/web/src/features/bills/components/pay-bill-sheet.tsx`
- Create tests
- Create `apps/web/src/features/bills/hooks/use-pay-bill.ts`
- Create hook tests

Base the interaction and styling on `create-transfer-sheet.tsx`, but keep a bill-specific request:

- destination card is fixed and visible, not selectable;
- source selector includes eligible active accounts only;
- amount defaults to `remainingMinor`;
- allow a smaller positive amount for partial payment;
- client schema prevents amount above the current remaining value, while the backend remains the
  concurrency authority;
- occurredAt defaults to now and is submitted as ISO UTC;
- description is backend-owned or displayed as fixed “Credit card bill payment” copy;
- show what the source/card balances will do without manually formatting/dividing money.

`usePayBill`:

- generates an idempotency key on mount;
- calls the generated pay endpoint;
- parses `BillPaymentResultSchema`;
- rotates the key only after success;
- invalidates bill lists/detail, accounts, transaction lists, transfer-derived lists, and net worth.

On `BillOverpaymentError`/stale remaining amount, close no data optimistically: refetch, update the
amount to the authoritative remaining value, and ask the user to confirm again.

After success, show whether the bill is partially or fully paid and provide a link to the resulting
transfer/transaction history. Reversal continues through the existing transfer UI; returning to the
bill must show the reduced derived payment automatically.

---

## 12. Navigation, settings, and route coverage

### Files

- Modify `apps/web/src/components/app-sidebar/app-sidebar.tsx`
- Modify sidebar tests
- Modify `apps/web/src/app/(app)/settings/page.tsx`
- Modify settings/route tests
- Modify mobile navigation only if product wants Bills among the five primary destinations

Add:

- desktop sidebar item `/bills`, label “Bills”, card icon consistent with the current text-icon
  system;
- settings hub item `/bills`, description “Card statements, reconciliation, and payments”;
- route-shell tests for list and detail pages;
- active-navigation tests for `/bills` and `/bills/{id}`.

Keep the five-item mobile bottom navigation unless Bills is explicitly promoted; users can reach it
through Settings. Do not silently displace an existing primary mobile route.

---

## 13. Error, empty, loading, and accessibility states

Required states:

- no credit-card account;
- configured card but first cycle not generated;
- bill awaiting upload;
- upload pending;
- upload failed with retry;
- no statement rows yet;
- matched-only statement;
- missing/ambiguous/parse-error rows;
- extra-ledger warnings;
- reconciliation conflict from stale data;
- partial payment;
- fully paid;
- payment reversed;
- overdue unpaid bill;
- API/network/runtime-validation failure.

Accessibility:

- every dialog/sheet has `role="dialog"`, `aria-modal`, labelled title, close button, Escape
  behavior, and restored focus;
- status is conveyed through text/icons as well as color;
- table actions have row-specific accessible names;
- progress bars expose current/max values;
- focus order follows lifecycle order;
- mobile reconciliation uses stacked labelled rows rather than a horizontally clipped desktop
  table;
- live regions announce worker completion and mutation results without duplicating toasts.

---

## 14. Frontend test matrix

### Models

- Filter parsing/serialization and unknown-value fallback.
- IST date labels including overdue/today/month boundary.
- Payment progress and next-action mapping.
- Eligible source account filtering.
- Reconciliation gate/count derivation.

### Hooks

- Exact generated path/body/path/query/header arguments.
- Runtime schema rejection.
- RFC 7807 conversion and unknown/network error conversion.
- Idempotency-key stability across rerender/failure and rotation after success.
- Correct, bounded invalidation keys.
- Infinite-query cursor propagation.
- Pending-upload polling starts/stops correctly.
- Multipart serializer contains file/mapping and no direct `fetch` is called.

### Components/routes

- Conditional account config fields and payload.
- Bill list cards/filter/load-more/empty/error states.
- Detail lifecycle for every backend state.
- Upload/map/pending/failed transitions.
- Reconciliation row actions and disabled states.
- Reconcile confirmation and stale `409` recovery.
- Partial/full payment form validation and success state.
- Responsive reconciliation rendering.
- Sidebar/settings links and route shells.
- Keyboard/dialog/accessibility assertions with Testing Library roles and names.

Use representative zod-derived fixtures with integer paise and real UUIDs. Avoid `as` casts in
fixtures; parse fixture builders through shared schemas where needed.

---

## 15. Delivery sequence and commits

The frontend starts only after backend schemas/OpenAPI/client generation are available.

1. `feat(web): add bill query models and server loaders`
2. `feat(web): configure credit card billing cycles`
3. `feat(web): add credit card bill list and navigation`
4. `feat(web): add bill detail lifecycle`
5. `refactor(web): share csv column mapping controls`
6. `feat(web): upload and review bill statements`
7. `feat(web): reconcile statement discrepancies`
8. `feat(web): pay reconciled credit card bills`
9. `test(web): cover bill lifecycle and accessibility`

Keep generated client changes in the backend/API contract commit, not mixed into the UI component
commit.

---

## 16. Definition of done

From the repository root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

Additionally verify:

- `pnpm --filter @treasury-ops/web test:coverage` meets all thresholds.
- `git diff --check` is clean.
- No hand-written API `fetch`, duplicated DTO, inline money division, browser-local cycle math,
  non-null assertion, or type cast was introduced.
- Every mutation has a stable-on-failure, rotate-on-success idempotency key.
- The feature works at narrow mobile and desktop widths.
- Upload processing survives a page refresh because the server-side upload/bill state is
  authoritative.
- Reversing a payment in the existing transfer UI is reflected after the bill detail refetches.
