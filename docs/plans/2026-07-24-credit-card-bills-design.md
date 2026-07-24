# Credit card bills: statement-verified due dates and payment

## Context

TreasuryOps currently treats `credit_card` as just one label in the generic account-type enum — there's no concept of a billing cycle, due date, statement, or "amount owed this month." Paying a card is indistinguishable from any other transfer. The goal is a CRED-like flow: each cycle produces a bill with a due date and amount owed (computed from the ledger), and — crucially — before that bill can be paid, the user must upload their real bank-issued CSV statement so the app can reconcile it against what's already logged, catching missing/duplicate/mismatched transactions. Paying then debits a chosen bank/cash account via the existing transfer mechanism.

Agreed scope (from prior discussion):
- Bill amount = auto-computed by summing ledger transactions in the cycle window (not manually entered).
- Cycle = fixed `statementDay` + `dueDay` per card, configured once.
- Payment reuses the existing transfer flow (`TransferService`).
- Partial payments are supported.
- Statement upload format = CSV (reuses the existing imports CSV pipeline, not a new PDF parser).
- Reconciliation = auto-match + flag mismatches (not fully manual).
- Verification is a **hard gate**: a bill cannot be paid until reconciled.

This document captures the design only — implementation has not started. See "Suggested implementation order" at the end for how to phase it in.

## Data model (new Drizzle migration)

Extend `apps/api/src/common/db/schema/account.ts` with nullable, credit-card-only columns (same precedent as `assets` table's kind-specific optional columns — `maturityAt`, `annualRateBps`, etc. in `asset.ts`):
- `statementDay integer` (1–31), `dueDay integer` (1–31), `nextStatementAt timestamptz` — all null for non-credit-card accounts.

New tables in `apps/api/src/common/db/schema/`:
- **`credit-card-bill.ts`** → `creditCardBills`: `id, userId, accountId (FK accounts), cycleStart, cycleEnd (= statement date), dueDate, amountDueMinor bigint, status` (enum: `awaiting_statement | reconciled`), `createdAt, updatedAt`. Unique index on `(accountId, cycleEnd)` — this is the idempotency key for the generation cron (mirrors AGENTS.md §3.5's "deterministic key" rule for cron writes).
- **`bill-statement.ts`** → `billStatementUploads`: `id, billId (FK), userId, filename, fileHash, mapping jsonb, status` (enum: `pending | staged | failed`), `acknowledgedExtraTransactionIds jsonb` (array, default `[]`), `createdAt, updatedAt`. Direct analog of `importBatches`.
  → `billStatementRows`: `id, uploadId (FK), rowNumber, raw jsonb, parsedOccurredAt, parsedAmountMinor, parsedDescription, matchedTransactionId (nullable FK -> transactions), matchStatus` (enum: `matched | missing_from_ledger | ambiguous`), `acknowledged boolean default false, createdAt`. Direct analog of `stagedRows`.
- Alter `transactions` (`transaction.ts`): add nullable `billId uuid` FK → `credit_card_bills`, with a conditional index — exact same pattern as the existing `importBatchId` column/index. This is how a bill-payment transfer leg gets tagged.

New enums in `enums.ts`: `billStatusEnum`, `billStatementUploadStatusEnum`, `billStatementRowMatchStatusEnum`.

Run `pnpm migrate:generate` to produce `0006_<name>.sql` — never hand-write migration SQL (AGENTS.md §4/§7).

**Design choice — no stored `amountPaidMinor`/payment-status column.** Instead, every bill payment is a normal transfer whose "to" leg carries `billId`. `amountPaidMinor` and `paymentStatus` (`unpaid | partial | paid`) are computed live by summing transactions where `billId = X AND type = 'income'`. This avoids a second write path to keep in sync with the ledger — reversing a bill payment (via the existing `TransferService.reverse`) automatically reduces the derived paid amount for free, and there's no dual-write consistency bug to guard against. `status` on `creditCardBills` only tracks the *reconciliation* lifecycle (`awaiting_statement → reconciled`), which genuinely can't be derived from the ledger.

## Backend module: `apps/api/src/bills/`

Follows the flat-providers-in-one-`@Module` pattern from `imports.module.ts`:
```ts
@Module({
  imports: [AccountsModule, TransactionsModule],
  controllers: [BillsController],
  providers: [
    CreditCardBillRepository,
    BillStatementRepository,
    BillsService,
    BillReconciliationService,
    BillGenerationCron
  ]
})
```
Register in `app.module.ts`'s `imports` array after `TransactionsModule`/`ImportsModule`.

Files:
- **`bills.service.ts`** — credit-card config upsert (validate `account.type === 'credit_card'`, else new `InvalidAccountTypeError extends DomainError`), list/get bills (with computed `paidMinor`/`paymentStatus`), `pay(billId, {fromAccountId, amountMinor, occurredAt}, idempotencyKey)`.
- **`bill-reconciliation.service.ts`** — statement upload (hash + parse), auto-match algorithm, row listing/patching, extra-transaction acknowledgement, the `reconcile()` gate check.
- **`bill-generation.cron.ts`** — daily `@Cron()`, same `if (this.config.env.SERVICE_ROLE !== "worker") return;` guard used in `RecurringMaterializeService`.
- **`credit-card-bill.repository.ts`**, **`bill-statement.repository.ts`** (uploads + rows split, mirrors `ImportBatchRepository`/`StagedRowRepository`) — every method takes `userId` first, per AGENTS.md §4.
- New errors in `common/errors/`: `InvalidAccountTypeError`, `BillNotReconciledError` (409), `BillOverpaymentError` (409), `InvalidStatementFileError` (mirrors `InvalidImportFileError`), `StatementNotReadyError` (mirrors `ImportBatchNotReadyError`). Each needs its `code` added to `packages/shared/src/errors/codes.ts`'s `ErrorCodes` array.

### Cycle computation

Reuse the `recurring_rules.nextRunAt`/claim-CAS convention rather than inventing new math patterns: `accounts.nextStatementAt` advances the same way `RecurringRuleRepository.claimRun` does. A small pure helper (in `packages/shared`, tested like `recurring.ts`'s `computeNextOccurrence`) computes the next calendar occurrence of `statementDay` and the following `dueDay` in IST (via `toISTCalendarDate`/`parseExplicitDate`, never raw `Date.getMonth()`, per AGENTS.md §5).

### Endpoints (`bills.controller.ts`, `/v1/...`)

| Method | Path | Purpose |
|---|---|---|
| PATCH | `/v1/accounts/:accountId/credit-card-config` | set `statementDay`/`dueDay`, seeds `nextStatementAt` |
| GET | `/v1/bills` | cursor-paginated list (filter by `accountId`), same shape as `PreviewStagedRowsQuerySchema` |
| GET | `/v1/bills/:billId` | detail incl. computed `paidMinor`/`paymentStatus` + reconciliation summary |
| POST | `/v1/bills/:billId/statement` | multipart CSV upload — `@UseInterceptors(FileInterceptor("file"))`, same `UploadedCsvFile` local type and service-level size/MIME/row-count validation as `imports.controller.ts` (reuse or mirror the constants in `packages/shared/src/import.ts`) |
| GET | `/v1/bills/:billId/statement/rows` | cursor-paginated rows + match summary |
| PATCH | `/v1/bills/:billId/statement/rows/:rowId` | manual match override / acknowledge |
| POST | `/v1/bills/:billId/statement/acknowledge-extra` | acknowledge a ledger txn not on the statement |
| POST | `/v1/bills/:billId/statement/reconcile` | hard-gate check → flips bill to `reconciled` |
| POST | `/v1/bills/:billId/pay` | idempotent, calls `TransferService.create` with `billId` |

No `ZodValidationPipe` exists in this codebase — validate inline via `Schema.parse(...)` in each handler, same as every existing controller.

### Statement parsing & auto-match

Reuse `parseCsvRow`/`ColumnMapping` from the imports module directly (don't reinvent CSV parsing) — the statement upload flow is structurally the import flow, scoped to one bill: hash the file, parse rows with the user-supplied column mapping, chunk-insert (200/txn, per `STAGED_ROW_INSERT_CHUNK_SIZE`).

Matching, per statement row → candidate ledger transactions (all transactions on `bill.accountId` within `[cycleStart, cycleEnd]`, any status — a reversed original and its reversal both really posted and would both appear on a real statement):
- Exact `amountMinor` match + `occurredAt` within ±1 day → `matched`, set `matchedTransactionId`.
- Zero candidates → `missing_from_ledger`.
- >1 equally-good candidate → `ambiguous` (needs manual resolution via the PATCH row endpoint).

Ledger transactions in the window claimed by no row → surfaced as "extra in ledger" in the summary (computed live, not stored).

**Gate default** (a judgment call within "auto-match + flag mismatches" — revisit if the intent was stricter): `reconcile()` only *requires* every statement row be `matched` or `acknowledged`. Extra-in-ledger transactions are surfaced as a warning in the summary but don't block reconciliation — blocking payment over an app-side bookkeeping anomaly unrelated to the real bill felt too strict. Easy to flip to a hard requirement later once this is used in practice.

### Payment

`BillsService.pay()`: assert `status === 'reconciled'`, compute `remaining = amountDueMinor - currentPaidMinor` (live sum), reject if `amountMinor > remaining` (`BillOverpaymentError`) or `remaining <= 0`. Then call `TransferService.create(userId, { fromAccountId, toAccountId: bill.accountId, amountMinor, occurredAt, description: "Credit card bill payment", tags: [...] }, idempotencyKey)` — extend `CreateTransferSchema`/`TransferService.create`/`TransactionRepository.create` with an optional `billId` passthrough so the "to" leg gets tagged. This is a small, additive extension of the existing transfer path (exactly the "reuse the existing transfer flow" choice) — and since it's a real transfer, it's reversible, idempotent, and shows up in transfer history for free.

## Frontend (`apps/web/src/features/bills/`)

- `hooks/use-bills.ts` — typed-client hooks (list/detail/pay) via generated `apiClient`, following `use-transfers.ts`'s idempotency-key-on-mount pattern (`useState(generateRequestId)`, refreshed `onSuccess`).
- `hooks/use-upload-statement.ts` — raw `fetch` + `FormData`, same as `use-upload-import.ts` (generated client can't model multipart `File` fields).
- Components:
  - Credit-card config fields (`statementDay`/`dueDay`) added conditionally to the existing create-account modal in `account-manager.tsx` when `type === 'credit_card'` is selected.
  - A bill list/summary (due date + amount, per card) — new card similar to the existing net-worth summary cards.
  - Bill detail flow: cycle info → "Upload statement" (reuse `import-wizard.tsx`'s upload/map/review step shape) → reconciliation review (matched/missing/ambiguous rows, resolve actions, extra-in-ledger warnings) → "Mark reconciled" (disabled until gate passes) → "Pay" (amount + from-account picker prefilled with remaining due, modeled on `create-transfer-sheet.tsx`).

## Testing

- Unit: cycle-date helper, matching algorithm (exact/ambiguous/missing cases), bill status transitions, new error classes.
- Integration (testcontainers, per existing `vitest.integration.config.ts` setup):
  - Generation cron produces the correct bill from seeded transactions across a cycle window; unique `(accountId, cycleEnd)` index prevents double-generation on retry.
  - Upload → parse → auto-match against a fixture CSV (new `apps/api/bruno/imports/`-style sample file for a credit card statement).
  - `reconcile()` rejects while unresolved rows remain.
  - `pay()` moves money via `TransferService`, respects idempotency and the overpayment cap; reversing the resulting transfer reduces the derived paid amount.
  - Parallel-execution tests: 5 concurrent cron runs → exactly one bill; concurrent `pay()` calls with the same idempotency key → exactly one transfer.
  - Money-path 90% line-coverage gate applies (AGENTS.md §7) since this module does real balance math.
- Add a `apps/api/bruno/bills/` folder (config, list, upload statement, reconcile, pay) mirroring the existing Bruno collection conventions.
- Full definition of done: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm verify:migrations && pnpm gen:client` (regenerate the web client for the new endpoints) before `pnpm build`.

## Suggested implementation order

1. Schema + migration (accounts columns, 2 new tables, `transactions.billId`) + shared zod schemas in `packages/shared/src/bill.ts`.
2. `bills` module: config endpoint, generation cron, plain bill CRUD (no statement/reconciliation yet) — verify a bill gets generated correctly end-to-end.
3. Statement upload + auto-match + reconciliation gate.
4. Payment endpoint (transfer + `billId` tagging).
5. Frontend: config UI → bill list/detail → upload/reconcile UI → pay UI.
