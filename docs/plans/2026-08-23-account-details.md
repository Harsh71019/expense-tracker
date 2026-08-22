# Account details page — implementation plan

**Status:** Approved for implementation

**Branch:** `feature/account-details`

**Primary goal:** Clicking an account opens a dedicated page that explains that account's current position, historical movement, spending mix, and complete account-scoped ledger.

**Authoritative constraints:** `AGENTS.md`, integer paise, append-only ledger, tenant-scoped repository reads, Zod at every boundary, generated OpenAPI client, cursor pagination, server components by default, and Tailwind-only UI.

## 1. Executive decision

The existing APIs are only partially sufficient.

- `GET /v1/transactions?accountId=...` already provides the correct cursor-paginated source for the account ledger and will be reused unchanged.
- `GET /v1/accounts` only returns active accounts, so it cannot reliably render a bookmarked detail URL after an account is archived.
- There is no tenant-scoped single-account endpoint.
- `GET /v1/transactions/insights` is user-wide and current-month-only. It cannot produce accurate account-specific totals, balance history, cash movement, or category mix. Calculating those from the first transaction page would silently produce wrong statistics once the account has more than one page.

Implement the missing read API first, then build the page against the generated client. No database migration or ledger mutation is required.

## 2. Product scope

The page at `/accounts/[accountId]` will provide:

1. account identity, type, archive state, creation date, opening balance, and current balance;
2. credit-card statement metadata when applicable;
3. selectable `30d`, `90d`, `1y`, and `all` analysis ranges;
4. range totals for money in, money out, net movement, and ledger-entry count;
5. a running balance chart;
6. an income-versus-expense movement chart;
7. a spending-by-category breakdown for ordinary posted expenses;
8. the cursor-paginated transaction history filtered to the account;
9. transaction detail access using the existing drawer/detail patterns; and
10. direct actions to add a transaction or return to all accounts.

The account grid will navigate to the new route when a card is clicked. The old account-information dialog will no longer be the primary card interaction.

## 3. Non-goals

This slice will not:

- edit immutable account fields or monetary ledger fields;
- introduce account deletion or unarchive behavior;
- alter transaction, transfer, reversal, balance, or audit write paths;
- add a charting or UI dependency;
- calculate investment performance, credit-card utilization, interest, or forecast data;
- replace the global transactions page;
- load every transaction into the browser to calculate statistics; or
- add a database table, column, index, or migration.

## 4. API design

### 4.1 Single-account read

Add:

```http
GET /api/v1/accounts/{accountId}
```

Response: the existing shared `AccountSchema`.

Behavior:

- resolve the account using `userId` from the authenticated session;
- include archived accounts so historical/bookmarked detail routes keep working;
- return the existing RFC 7807 account-not-found response for a missing or other-tenant id; and
- require the existing account read scope for API-key access.

### 4.2 Account insights read

Add:

```http
GET /api/v1/accounts/{accountId}/insights?range=30d|90d|1y|all
```

Default range: `30d`.

The response is a shared Zod-derived `AccountInsights` contract:

```text
AccountInsights
├─ range: 30d | 90d | 1y | all
├─ from: ISO UTC timestamp
├─ to: ISO UTC timestamp
├─ bucket: day | week | month
├─ summary
│  ├─ incomeMinor: non-negative integer paise
│  ├─ expenseMinor: non-negative integer paise
│  ├─ netMinor: signed integer paise
│  └─ transactionCount: non-negative integer
├─ balanceSeries[]
│  ├─ period: YYYY-MM-DD
│  └─ balanceMinor: signed integer paise
├─ cashflowSeries[]
│  ├─ period: YYYY-MM-DD
│  ├─ incomeMinor: non-negative integer paise
│  └─ expenseMinor: non-negative integer paise
└─ spendingByCategory[]
   ├─ categoryId?: UUID
   ├─ name: string
   ├─ color?: category color
   ├─ amountMinor: positive integer paise
   └─ transactionCount: positive integer
```

Rules:

- Dates and period boundaries are computed in `Asia/Kolkata`; timestamps over the wire remain UTC.
- `30d` and `90d` use daily buckets, `1y` uses monthly buckets, and `all` uses monthly buckets from the account creation month.
- Money-in and money-out describe physical account movement. They include append-only reversal entries so their net reconciles with the balance change.
- Spending by category describes consumption. It includes only posted, ordinary, non-transfer expenses and excludes active asset fundings, matching the reporting semantics used elsewhere.
- Balance history begins from the balance immediately before the selected range, then applies every in-range ledger delta. Empty buckets carry the last known balance.
- An account with no transactions still returns a valid flat balance series and zero totals.
- Every repository predicate includes both `userId` and `accountId`.

### 4.3 OpenAPI and generated client

- Register both routes and shared schemas in `apps/api/src/openapi/registry.ts`.
- Document `200`, `401`, `404`, `422`, and `500` responses.
- Regenerate `apps/api/openapi.json` and `apps/web/src/lib/api/generated/schema.d.ts` with `pnpm gen:client`.
- Confirm the authenticated routes appear in the tenancy probe input.

## 5. Backend structure

Keep controller, service, and repository responsibilities separate:

```text
AccountController
  ├─ parses accountId and range with shared Zod schemas
  └─ calls one AccountService method

AccountService
  ├─ resolves the tenant-owned account
  ├─ throws EntityNotFoundError when unavailable
  └─ requests the account-scoped read model

AccountRepository
  ├─ findById(userId, accountId), including archived
  └─ tenant-scoped account metadata only

AccountInsightsRepository
  ├─ range summary
  ├─ pre-range balance delta
  ├─ bucketed cash movement
  └─ category spending mix
```

The insights work is read-only. It does not use `withTxn`, update `balanceMinor`, touch audit rows, or add a migration.

## 6. Frontend route and data flow

Use a hybrid server/client composition:

```text
/accounts/[accountId] (Server Component)
  ├─ validate route id
  ├─ fetch account, insights, first transaction page, and categories in parallel
  ├─ call notFound() for a missing account
  └─ render AccountDetailPage client island
       ├─ range tabs update ?range= in the URL
       ├─ charts render from server-provided insights
       └─ transaction history continues with the existing infinite-query hook
```

Data access remains exclusively through the generated API client. The route will have local `loading.tsx` and `error.tsx` boundaries. Search parameters are canonical state for the selected range so refresh, bookmarks, and back navigation behave correctly.

The first page of account transactions uses:

```text
{ accountId, limit: 20 }
```

Every subsequent cursor request retains the same `accountId`; this prevents the account page from ever widening into a cross-account list.

## 7. Visual design plan

### Subject and job

This is a personal ledger account statement for someone checking money on a phone during a commute. Its single job is to answer: “What changed this account balance, and what does the recent movement look like?”

### Tokens

Use the existing semantic theme rather than introduce hard-coded page colors:

| Role            | Existing token / light value   | Purpose                             |
| --------------- | ------------------------------ | ----------------------------------- |
| canvas          | `surface` / `#f6f8f6`          | quiet page background               |
| statement paper | `surface-elevated` / `#ffffff` | ledger and chart panels             |
| ink             | `foreground` / `#0d1512`       | headings and primary values         |
| account accent  | `accent` / `#087a4b`           | focus, balance line, selected range |
| money in        | `income` / `#087a4b`           | inflow encoding                     |
| money out       | `expense` / `#dc2626`          | outflow encoding                    |

Typography stays with the product's existing `Inter Tight` body/display face and `JetBrains Mono` for periods, labels, and money. This preserves the application's established identity: the numbers, rather than a decorative display font, are the personality.

### Layout

```text
Desktop
┌─ Back / account identity ─────────────── Add transaction ┐
│  CURRENT BALANCE        metadata / opening / created      │
├─ range tabs ───────────────────────────────────────────────┤
│  money in │ money out │ net movement │ entries             │
├─ running balance (2/3) ──────┬─ spending mix (1/3) ───────┤
├─ cash movement bars ─────────┴──────────────────────────────┤
│  ACCOUNT LEDGER — cursor-paginated passbook rows            │
└───────────────────────────────────────────────────────────────┘

Mobile
┌─ back + account identity ┐
│ current balance          │
│ account metadata strip   │
├─ horizontally safe range tabs
├─ 2 × 2 summary grid      │
├─ running balance         │
├─ cash movement           │
├─ category mix            │
│ ledger rows              │
└──────────────────────────┘
```

### Signature element

The memorable element is a “balance trace”: a precise running-balance line laid over faint statement-paper rules, with each range endpoint labelled in mono. It connects the account's headline balance to the ledger below without adding decorative visual noise.

### Design critique before build

The first concept risked becoming a generic dashboard made of four stat cards and three unrelated chart cards. The revision makes the page read as one account statement: a single balance hierarchy, charts aligned on shared statement rules, and the existing passbook row anatomy continuing directly below. Boldness is spent on the balance trace; everything else stays restrained.

Accessibility requirements:

- 44px minimum interactive targets;
- visible focus rings and keyboard-reachable range controls;
- income/expense encoded by label and sign as well as color;
- SVG charts expose useful `role="img"` labels and screen-reader data tables;
- empty charts explain how to create data;
- responsive layouts down to narrow phones; and
- motion is limited to the existing reduced-motion-aware page transition.

## 8. Testing plan

### Shared contracts

- accept each supported range and reject unknown values;
- validate signed/unsigned money boundaries and series shapes;
- reject malformed period keys and category entries.

### API unit tests

- controller parses ids/ranges and delegates once;
- service returns active and archived owned accounts;
- service returns not found for a missing or other-tenant account;
- repository aggregation maps database bigint values through safe-integer parsers;
- reversal movement reconciles with net balance change;
- spending mix excludes transfers, reversed entries, and active asset funding.

### Integration/e2e tests

- two users with accounts and transactions receive only their own insights;
- range boundaries follow IST;
- running balance equals opening balance plus ledger deltas;
- empty-account response is stable;
- endpoint is present in OpenAPI and covered by the tenancy probe;
- every integration test ends with `assertInvariants()`.

### Frontend tests

- account cards link to `/accounts/{id}`;
- route renders account, insights, and account-filtered first page;
- missing account invokes `notFound()`;
- changing range updates the URL and requests that range;
- charts handle positive, negative, flat, and empty data;
- transaction pagination retains `accountId`;
- transaction rows open details; and
- loading/error/empty states are accessible.

### Visual QA

- capture desktop and mobile screenshots with mock data;
- inspect light and dark themes;
- inspect zero-data, negative-balance, archived, and credit-card variants; and
- run an axe pass on the detail route.

## 9. Delivery sequence

1. Add shared account-insight query/response schemas and tests.
2. Implement tenant-scoped repository aggregation, service methods, controller routes, and tests.
3. Register OpenAPI routes and regenerate the typed client.
4. Add server loaders and query keys.
5. Add the dynamic route with loading, error, and not-found behavior.
6. Build the account header, summary strip, SVG charts, category breakdown, and account-only ledger.
7. Replace the account-card dialog interaction with route navigation.
8. Update backend/frontend documentation if the final behavior differs from this plan.
9. Run formatting, lint, typecheck, unit, integration, e2e, build, and visual QA.

## 10. Definition of done

The feature is complete when:

- clicking any visible account opens its dedicated route;
- no account detail response can cross tenant boundaries;
- archived account detail URLs still resolve;
- every displayed statistic comes from the complete server-side range, not loaded-page data;
- the transaction ledger never drops its `accountId` filter while paginating;
- money values remain integer paise and render through shared money helpers/components;
- no write path, migration, or dependency was added;
- the generated OpenAPI client is current; and
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm test:e2e && pnpm build` pass locally.
