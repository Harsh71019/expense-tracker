# Assets, Valuations, and Net Worth UI

> Audit date: 2026-07-16  
> Frontend status: **implemented 2026-07-17**  
> Backend status: **ready** — transport parsing, mutation idempotency, replay contracts, generated client, and concurrency coverage are complete.

## 0. Outcome and acceptance gate

Provide one cohesive feature for recording non-account assets/liabilities, appending valuation snapshots, and seeing a current net-worth breakdown.

The acceptance demo is: create a fixed deposit with an opening value, see it included in net worth, append a newer valuation, see the current value update while history remains visible, add a loan liability that reduces net worth, close an asset, and confirm it disappears from the active calculation without deleting its stored history.

## 1. Verified current state

- Asset create/list/close and valuation create/list are implemented in `apps/api/src/assets/asset.controller.ts` and `asset.service.ts`.
- `GET /api/v1/net-worth` is implemented by `net-worth.controller.ts` and `net-worth.service.ts`.
- All paths are registered in `apps/api/src/openapi/registry.ts` and generated into the web client.
- Schemas live in `packages/shared/src/asset.ts`.
- `/reports` is only a `ComingSoon` placeholder; the dashboard totals account balances only.
- There is no assets route, net-worth view, feature slice, loader, query key, mutation, valuation history, or close action in the web app.

## 2. Backend contract

| Operation                              | Request/response                | Purpose                                          |
| -------------------------------------- | ------------------------------- | ------------------------------------------------ |
| `GET /v1/assets`                       | `Asset[]`                       | Active asset list                                |
| `POST /v1/assets`                      | `CreateAsset` → `Asset`         | Create metadata and opening valuation atomically |
| `POST /v1/assets/{assetId}/close`      | id → `204`                      | Close active asset                               |
| `GET /v1/assets/{assetId}/valuations`  | id → `ValuationPage`            | Append-only history                              |
| `POST /v1/assets/{assetId}/valuations` | `CreateValuation` → `Valuation` | Add snapshot                                     |
| `GET /v1/net-worth`                    | `NetWorth`                      | Accounts + latest asset values + signed total    |

Asset kinds are `loan_receivable`, `loan_liability`, `fixed_deposit`, `gold`, `silver`, and `investment`.

Conditional create fields:

- Fixed deposit: optional maturity date and annual rate in basis points.
- Gold/silver: optional quantity in milli-units.
- Every asset: name, opened date, signed opening value.
- Only a loan liability may have a negative value.

Valuations are immutable snapshots. Negative valuation is valid only for loan liabilities. Closed assets cannot receive new valuations.

## 3. Completed backend and shared-contract prerequisites

### HTTP date parsing

`AssetSchema`, `ValuationSchema`, and `NetWorthSchema` now use transport-safe coercion for JSON ISO timestamps. The web app must still parse rather than cast responses.

### Idempotency

Asset create, close, and valuation create now require idempotency headers and publish replay behavior. The completed gate includes:

1. Make all three mutations response-idempotent.
2. Publish headers/replay responses in OpenAPI.
3. Add five-attempt concurrency integration tests.
4. Regenerate the client.

### Pagination truthfulness

Valuation history returns a page shape but currently loads all items and reports `hasMore: false`. The first UI can consume that honestly; do not implement infinite scrolling until the backend has cursor parameters.

## 4. Proposed routes and feature slice

```text
apps/web/src/app/(app)/assets/page.tsx
apps/web/src/app/(app)/assets/[assetId]/page.tsx
apps/web/src/app/(app)/reports/page.tsx
apps/web/src/features/assets/
├── components/
│   ├── asset-list.tsx
│   ├── asset-row.tsx
│   ├── create-asset-form.tsx
│   ├── asset-detail.tsx
│   ├── valuation-history.tsx
│   ├── add-valuation-form.tsx
│   └── close-asset-dialog.tsx
├── hooks/
├── server/
├── model/
└── index.ts
apps/web/src/features/net-worth/
├── components/net-worth-summary.tsx
├── hooks/use-net-worth.ts
├── server/get-net-worth.ts
└── index.ts
```

Use separate feature public APIs for asset management and the read-only net-worth projection, while keeping this one implementation handoff because they share the same backend module and user outcome.

Link `Assets` from `/more`; replace `/reports` placeholder with the current net-worth report only. Do not label it monthly/cashflow reporting because those APIs do not exist.

## 5. Query keys and invalidation

Add centralized keys:

```text
qk.assets()
qk.assetValuations(assetId)
qk.netWorth()
```

- Server-render asset list and net worth; hydrate interactive hooks with initial data.
- Parse all responses with corrected shared schemas.
- Asset create invalidates assets, valuations for the returned id, and net worth.
- Add valuation invalidates that asset's valuation history and net worth.
- Close invalidates assets and net worth.
- Account creation/archive, transactions, and transfers also invalidate net worth because account balances contribute to it.
- Each mutation surface generates an idempotency UUID on mount and rotates only after success.

## 6. Money and sign design

Backend values are signed safe-integer paise, while `formatMinor()` and the existing `<Money>` accept non-negative values. Extend the shared presentation component in one tested place:

- Convert a safe signed integer to a semantic sign/variant plus absolute minor value.
- Ensure `Number.MIN_SAFE_INTEGER` cannot be negated unsafely; schemas currently permit it, so either tighten the backend range symmetrically or handle it explicitly.
- Never pass a negative integer to `formatMinor()` and never divide by 100 inline.
- Liabilities use text labels and a minus sign, not color alone.

Creation and valuation forms should use an absolute `AmountInput` plus an explicit asset/liability direction derived from kind. Do not let users enter arbitrary negative signs for non-liability kinds.

## 7. UX specification

### Net worth report

- Hero: net worth and `as of` timestamp.
- Two breakdowns: accounts and assets/liabilities, with exact signed amounts.
- Show each asset's valuation date and mark `No valuation` if the backend returns null.
- Include a textual formula/table fallback if a visual bar is added.
- No historical trend chart: the current backend returns one snapshot only.

### Asset list and creation

- Group active items by kind or `Assets` versus `Liabilities`.
- Kind selection controls which conditional fields render.
- Annual rate input is display percent but converts deliberately to integer basis points; add a pure, tested parser rather than float money logic.
- Quantity is integer milli-units with a clear gram/unit explanation.
- Opening valuation is created atomically by the API; do not issue a second valuation request.

### Asset detail and valuation history

- Display stable metadata and newest valuation first.
- Append form fields: value, valued-at date; source should default to `manual` and should not expose `maturity_projection` as a user choice unless product rules explicitly require it.
- Closing uses explicit confirmation and explains that history remains but new valuations stop.
- There is no edit or delete valuation endpoint; do not show either action.

## 8. Loading, errors, accessibility, and mobile

- Stream or skeleton the net-worth hero separately from long breakdowns.
- Preserve forms and idempotency keys across network errors.
- Invalid negative-value responses produce a safe error boundary, not a cast.
- Asset-kind labels are human-readable and never raw enum strings.
- Tables adapt to stacked mobile rows; all controls meet 44 px targets.
- Any chart includes an accessible data table and respects reduced motion.

## 9. Tests

- Shared/unit: HTTP ISO date parsing, signed-minor presentation, min/max safe integer edges, basis-point parser, kind-specific field model.
- Component: each asset kind, liability sign, missing/stale valuation, empty net worth, create/refine errors, close confirmation.
- Hook: generated-client calls, idempotency header reuse, and cross-feature net-worth invalidations.
- Route: RSC initial data for assets/detail/net worth and not-found behavior.
- E2E: create asset, opening valuation appears, append valuation, net worth updates, add liability, close asset, verify exclusion and retained backend history.
- Backend: parallel mutation tests and invariant checks after every integration/E2E flow.

## 10. Out of scope

- Historical net-worth charts/snapshots; no API exists.
- Editing asset metadata or reopening closed assets.
- Deleting/editing valuations.
- Market-price fetching, brokerage sync, interest posting, amortization, or currency conversion.
- Monthly cashflow/report analytics.

## 11. Definition of done

- Transport-safe shared schemas and mutation idempotency are complete.
- `/reports` claims only the net-worth capability actually supported.
- Signed money is exact and tested; no inline money arithmetic exists.
- All writes remain append-only where required and use generated client paths.
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm test:e2e` passes.
