# Account Management UI

> Audit date: 2026-07-16  
> Frontend status: **implemented 2026-07-17**  
> Backend status: **ready** — create/archive idempotency, replay headers, OpenAPI, generated client, and concurrency coverage are complete.

## 0. Outcome and acceptance gate

Build a dedicated account-management experience where a signed-in user can see every active account, add another account with the correct opening balance, and archive an account without touching ledger history.

The feature is complete when a user who already has an account can add a second one, see its exact paise balance on the dashboard and account list, archive it through an explicit confirmation, and no longer see it in active selectors. Archiving must not delete transactions or rewrite balances.

## 1. Verified current state

- `GET /api/v1/accounts`, `POST /api/v1/accounts`, and `PATCH /api/v1/accounts/:accountId/archive` exist in `apps/api/src/accounts/account.controller.ts`.
- `CreateAccountSchema` and `AccountSchema` are defined in `packages/shared/src/account.ts`.
- All three paths are registered in `apps/api/src/openapi/registry.ts` and generated into `apps/web/src/lib/api/generated/schema.d.ts`.
- The dashboard in `apps/web/src/app/(app)/page.tsx` shows active accounts and totals their balances.
- `apps/web/src/features/quick-add/components/account-setup.tsx` can create only the first account, forces `openingBalanceMinor` to `0`, and is rendered only when there are no active accounts.
- There is no `/accounts` route, active-account management list, add-another-account action, opening-balance control, or archive action.

This is therefore a **partial UI gap**, not a new backend feature.

## 2. Backend contract

| Operation                                | Request         | Response    | UI purpose                                     |
| ---------------------------------------- | --------------- | ----------- | ---------------------------------------------- |
| `GET /v1/accounts`                       | none            | `Account[]` | Initial server-rendered list and query refresh |
| `POST /v1/accounts`                      | `CreateAccount` | `Account`   | Add an account                                 |
| `PATCH /v1/accounts/{accountId}/archive` | path id         | `204`       | Remove an account from active use              |

`CreateAccount` contains:

- `name`: trimmed, 1–80 characters.
- `type`: `bank`, `credit_card`, `cash`, `wallet`, or `investment`.
- `openingBalanceMinor`: signed safe integer paise.

`Account` additionally contains `balanceMinor`, fixed `INR` currency, timestamps, and `isArchived`.

The list repository currently returns active accounts only. The UI must not promise an archived-account history screen until the backend can return archived accounts.

## 3. Completed backend prerequisite

Account creation and archive now require `Idempotency-Key`. A repeated archive replays its durable `null` result instead of falling through to the active-account filter and becoming `404`.

The backend gate completed before implementing the new mutation hooks:

1. Add an idempotency contract to account creation and archive.
2. Register the headers and replay responses in OpenAPI.
3. Regenerate the client with `pnpm gen:client`.
4. Add parallel integration coverage proving five identical attempts create/archive exactly one effect and return the original successful result.

Do not simulate idempotency in React state or local storage. The server is the authority.

## 4. Proposed route and feature slice

```text
apps/web/src/app/(app)/accounts/page.tsx
apps/web/src/features/accounts/
├── components/
│   ├── account-list.tsx
│   ├── account-row.tsx
│   ├── create-account-form.tsx
│   └── archive-account-dialog.tsx
├── hooks/
│   ├── use-accounts.ts
│   ├── use-create-account.ts
│   └── use-archive-account.ts
├── server/get-accounts.ts
└── index.ts
```

Move or re-export the existing account query/create logic from `features/quick-add` so quick-add consumes the public `features/accounts` API. Do not maintain duplicate account hooks in two feature folders.

Add `Accounts` under `/more` rather than adding a sixth primary navigation item.

## 5. Data flow and query behavior

- Extend `qk` only if needed; `qk.accounts()` already exists.
- `page.tsx` stays a Server Component, calls `getAccounts()`, and passes initial data into the client list.
- Parse runtime responses with `AccountSchema.array()`. Generated TypeScript types do not replace Zod validation.
- Create/archive hooks use the generated client and map problem+json through the existing error helpers.
- Generate each mutation's idempotency UUID when its form/dialog mounts. Reuse it for retries and rotate it only after confirmed success.
- After create or archive, invalidate `qk.accounts()`, all transaction queries that expose account filters/names, and any net-worth query added by the assets feature.

## 6. UX specification

### Account list

- Show account name, type label, and current balance.
- Use the shared money presentation path. The existing `<Money>` cannot accept a negative number, so signed account balances need a small, tested extension or wrapper that passes the absolute integer and renders the sign semantically. Never pass a negative value into `formatMinor()`.
- Order should match the API response; do not invent drag ordering without backend support.
- The empty state links to the create form.

### Create form

- Fields: name, account type, opening balance amount, and balance direction/sign.
- Store integer paise in form state. Do not parse a float or divide a display string by 100.
- A credit-card outstanding balance should be representable as a negative opening balance; use an explicit `Available / Owed` or `Positive / Negative` choice rather than accepting an ambiguous minus sign on a mobile keypad.
- Validate with `CreateAccountSchema` before submission and map server field errors back to controls.
- On success, show the created account, invalidate dependent queries, rotate the idempotency key, and offer `Add transaction`.

### Archive flow

- Label the action `Archive`, never `Delete`.
- Explain that existing transactions remain in the ledger and only future selection is disabled.
- Show the account name and current balance in the confirmation.
- Do not offer balance editing or automatic balance transfer. Moving money is a separate transfer feature.

## 7. Loading, error, accessibility, and mobile states

- Route loading state uses account-row skeletons, not a blank page.
- Mutation buttons remain disabled while the same logical request is pending, but retry uses the original idempotency key.
- A `409` or domain constraint should remain actionable and preserve form input.
- Every account-type option has visible text; icons are supplemental.
- Dialog focus moves to the heading, is trapped, and returns to the invoking control.
- Touch targets are at least 44 px and the add action remains reachable one-handed.

## 8. Tests

- Unit: signed-balance view model and account-type labels.
- Component: list positive/negative/zero balances; create schema errors; server problem mapping; archive confirmation copy.
- Hook: generated-client calls, idempotency header reuse, cache invalidation, and failed-request rollback.
- Route: server loader hands initial accounts to the feature without a duplicate first fetch.
- E2E: create a second account, verify exact balance, archive it, confirm it disappears from quick-add but its transactions remain queryable.
- Backend prerequisite: five parallel identical creates and archives produce exactly one effect.

## 9. Out of scope

- Renaming an account; no backend endpoint exists.
- Editing opening or current balance; monetary corrections must use ledger entries.
- Restoring archived accounts or listing archived accounts; no backend contract exists.
- Reordering accounts, setting icons, or multi-currency support.

## 10. Definition of done

- Backend idempotency prerequisite is complete and reflected in the generated client.
- No hand-written API fetch is introduced.
- Money remains integer paise and ledger documents remain untouched.
- New authenticated route appears in OpenAPI-driven tenancy coverage where applicable.
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm test:e2e` passes.
