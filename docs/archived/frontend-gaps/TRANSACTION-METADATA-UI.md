# Transaction Details and Metadata Editing UI

> Audit date: 2026-07-16  
> Frontend status: **implemented 2026-07-17**  
> Backend status: **ready** — tenancy-scoped detail GET, idempotent metadata PATCH, generated client, and transfer-leg rejection policy are complete.

## 0. Outcome and acceptance gate

Add a transaction detail experience that exposes the ledger metadata already returned by the API and lets users correct only non-monetary metadata: description, tags, and category.

The feature is complete when a user can open a transaction, see its account/category/source/status/linkage/timestamps, update permitted metadata, filter the ledger by account and category, and never see an option that mutates amount, type, account, or occurrence date.

## 1. Verified current state

- `GET`, `POST`, `PATCH /api/v1/transactions/:transactionId`, and reversal exist in `apps/api/src/transactions/transaction.controller.ts`.
- `UpdateTransactionSchema` permits only `description`, `tags`, and nullable `categoryId` in `packages/shared/src/transaction.ts`.
- PATCH is registered in OpenAPI and the generated frontend client.
- `/transactions` already provides cursor pagination, text/date filters, and reversal.
- Current rows show description, day, amount, status, and limited reversal context.
- There is no `/transactions/[id]` route, dedicated transaction GET endpoint, metadata edit form, tags input, account/category/source display, or account/category filter controls.
- The list contract accepts `accountId` and `categoryId`, and the URL model can serialize them, but `TxnFilters` renders only text/from/to fields.
- Quick-add always submits `tags: []` and exposes no tag control.

## 2. Backend contract

| Operation                                       | Existing use                            | Missing UI use                                          |
| ----------------------------------------------- | --------------------------------------- | ------------------------------------------------------- |
| `GET /v1/transactions`                          | List, text/date filtering, cursor pages | Account/category filtering and detail lookup workaround |
| `POST /v1/transactions`                         | Quick-add                               | Optional tag capture                                    |
| `PATCH /v1/transactions/{transactionId}`        | None                                    | Description/tags/category correction                    |
| `POST /v1/transactions/{transactionId}/reverse` | Row `Undo`                              | Detail-page reversal with safer confirmation/context    |

PATCH requires at least one field. `categoryId: null` clears the category; omitting it leaves the current category unchanged.

`GET /v1/transactions/:id` is tenancy-scoped, registered in OpenAPI, and generated, so direct URLs/bookmarks do not scan cursor pages or depend on cache state.

## 3. Completed backend prerequisites

1. `GET /v1/transactions/{transactionId}` provides stable detail loading.
2. PATCH is idempotent and publishes its header/replay behavior with concurrency coverage.
3. Individual transfer-leg PATCH is rejected until a group-level metadata endpoint exists.
4. The client is regenerated after the contract changes.

## 4. Proposed route and files

```text
apps/web/src/app/(app)/transactions/[transactionId]/page.tsx
apps/web/src/features/transactions/
├── components/
│   ├── txn-detail.tsx
│   ├── edit-txn-metadata-form.tsx
│   ├── txn-tags-input.tsx
│   └── reverse-txn-dialog.tsx
├── hooks/
│   ├── use-txn.ts
│   └── use-update-txn.ts
└── server/get-txn.ts
```

Extend the existing feature rather than creating a parallel transaction-detail feature. Add `qk.txn(id)` to the centralized key factory.

## 5. Detail view

Display:

- Description and exact amount through the shared money component.
- Type, status, source, and occurred-at time in `Asia/Kolkata`.
- Account and category names resolved from shared account/category queries, with safe fallbacks for archived references.
- Tags, creation/update timestamps, reversal-of/reversed-by linkage, and transfer group context.
- A visible append-only explanation near reversal: monetary correction creates compensating entries.

Do not expose raw `userId` or idempotency key as primary UI. Transaction ids/group ids can live in a diagnostic disclosure if useful.

For transfer legs, replace ordinary `Undo` with the transfer-group reversal flow from `TRANSFERS-UI.md`.

## 6. Metadata edit behavior

- Initialize form values from `Transaction` and validate with `UpdateTransactionSchema`.
- Editable fields are exactly description, category, and tags.
- `No category` sends `categoryId: null` only when it changed from a value.
- Normalize tags with the shared schema: trimmed, non-empty, maximum 40 characters each and 20 tags total.
- Generate the PATCH idempotency key when the edit form opens; keep it through retries and rotate after success.
- Do not show disabled inputs for amount/type/account/date that imply eventual editability. Show those values in a read-only ledger facts section.
- On success, update `qk.txn(id)` and invalidate all `qk.txns(...)` variants. Category changes may affect any future reports, so invalidate relevant report data when those queries exist.

## 7. Complete list filtering and quick-add tags

- Add account and category selectors to `TxnFilters` using active query data.
- Keep filter state in URL search params; clearing resets the cursor.
- Preserve unknown/archived filter ids in the URL and render an `Archived or unavailable` selected label rather than silently dropping the filter.
- Category options may be limited by kind only if a type filter exists; the current list query has no transaction-type filter, so show both kinds with explicit labels.
- Add an optional tags control to quick-add, backed by the same component/model as the edit form. Do not invent a tag-autocomplete API.

## 8. Loading, error, accessibility, and concurrency

- Direct detail navigation has a route skeleton and real not-found state.
- A stale edit conflict should refetch and preserve the user's draft; do not overwrite silently.
- Status, reversal, and source are represented by text as well as color.
- Tag remove buttons have accessible names.
- Confirmation dialogs return focus to their triggers.
- Reversing/updating one row must disable only that logical action, not every transaction row.

## 9. Tests

- Unit: patch-diff construction, tag normalization, archived lookup fallback, and filter serialization.
- Component: every status/source/linkage state, exact permitted edit fields, nullable category clearing, tags limits, and transfer-leg action routing.
- Hook: generated GET/PATCH calls, idempotency reuse, detail/list invalidation, and problem+json mapping.
- Route: direct load, not found, refresh, and deep link.
- E2E: edit description/category/tags; verify amount/type/account/date are unchanged; refresh and filter by the new category; reverse from detail and assert compensating entry.
- Backend: five parallel identical PATCH attempts produce one logical audit/update result.

## 10. Out of scope

- Editing monetary fields, account, type, or occurred-at date.
- Deleting transactions.
- Reposting automatically after metadata edit.
- Tag analytics or tag management.

## 11. Definition of done

- Detail GET and idempotent PATCH prerequisites are complete and generated.
- Every runtime response is parsed with shared Zod schemas.
- URL filters include account/category without losing existing text/date behavior.
- Transfer legs cannot be individually reversed from this UI.
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm test:e2e` passes.
