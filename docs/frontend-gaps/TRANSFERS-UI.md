# Account Transfers UI

> Audit date: 2026-07-16  
> Frontend status: **implemented 2026-07-17**  
> Backend status: **ready** — create requires the idempotency header and natural group-reversal replay is documented and surfaced.

## 0. Outcome and acceptance gate

Allow a user to record money moved between two of their accounts as one logical transfer and reverse that transfer as one logical action.

The acceptance demo is: move ₹10,000 from Bank to Cash, observe both account balances change exactly once, see one grouped transfer in history, reverse it, and observe both balances restore with four immutable ledger legs linked to their transfer groups.

## 1. Verified current state

- `POST /api/v1/transfers` and `POST /api/v1/transfers/:transferGroupId/reverse` exist in `apps/api/src/transactions/transfer.controller.ts`.
- `TransferService` writes both legs, balance changes, and audits inside one `withTxn` in `apps/api/src/transactions/transfer.service.ts`.
- `CreateTransferSchema`, `TransferSchema`, and `TransferReversalSchema` are in `packages/shared/src/transaction.ts`.
- Both paths are in OpenAPI and the generated web schema.
- No transfer page, form, hook, query key, grouped row, or transfer reversal UI exists.
- Ordinary transaction rows currently show `Undo` for every posted transaction. A transfer leg contains `transferGroupId`, so the generic single-transaction reversal must not be offered for transfer legs.

## 2. Backend contract

| Operation                                      | Request                              | Response           | Semantics                                     |
| ---------------------------------------------- | ------------------------------------ | ------------------ | --------------------------------------------- |
| `POST /v1/transfers`                           | `CreateTransfer` + `Idempotency-Key` | `Transfer`         | Creates linked expense/income legs atomically |
| `POST /v1/transfers/{transferGroupId}/reverse` | group id                             | `TransferReversal` | Creates two compensating legs atomically      |

`CreateTransfer` fields are `fromAccountId`, `toAccountId`, positive integer `amountMinor`, `occurredAt`, `description`, and `tags`. The shared schema rejects identical source and destination accounts.

The returned `Transfer` contains the group id and both full transaction legs. A reversal returns a new transfer group id plus a two-leg tuple.

## 3. Completed contract hardening

The controller now requires `Idempotency-Key`, and mutation forms must generate a UUID on mount.

Completed before frontend release:

1. Require the header in controller validation and OpenAPI.
2. Preserve existing replay behavior and document `200` replay versus `201` create.
3. Confirm group reversal's natural replay behavior is part of the published contract or add an explicit idempotency header.
4. Run `pnpm gen:client` and keep the parallel integration test gate.

## 4. Proposed route and feature slice

```text
apps/web/src/app/(app)/transfers/new/page.tsx
apps/web/src/features/transfers/
├── components/
│   ├── transfer-form.tsx
│   ├── transfer-row.tsx
│   └── reverse-transfer-dialog.tsx
├── hooks/
│   ├── use-create-transfer.ts
│   └── use-reverse-transfer.ts
├── model/group-transactions.ts
└── index.ts
```

Add a `Transfer between accounts` action to `/add` and `/more`; do not add a primary nav item. Keep the existing quick expense/income form focused on capture speed.

## 5. Form and mutation behavior

- Load active accounts through the accounts feature/query.
- Generate one UUID when the transfer form mounts; retain it through retry and rotate after confirmed success.
- Use `AmountInput`; form state contains positive integer paise only.
- Default `occurredAt` consistently with quick-add, using the shared/IST date approach.
- Validate with `CreateTransferSchema` before calling the generated client.
- Disable or remove the chosen source account from the destination options, while still relying on server validation.
- On success, invalidate accounts, all transaction queries, dashboard/net-worth data, and any account detail queries.
- Do not optimistically change both balances unless the rollback restores every affected query. A simple pending state plus authoritative invalidation is acceptable for this high-impact mutation.

## 6. Transaction-list integration

Implement a pure grouping step over each loaded transaction page:

- Two posted legs with the same `transferGroupId` render as one transfer row: `From account → To account`, one unsigned amount, date, description, and tags.
- Reversal legs render as a grouped reversal connected to the original transfer where the loaded data permits it.
- Never merge records across different group ids or infer a pair from amount/date alone.
- Pagination can split legs across pages. The initial safe behavior is to render an incomplete grouped row marked `Transfer details loading` and reconcile when both legs are present; do not silently hide a leg.
- A posted row with `transferGroupId` calls `POST /transfers/{transferGroupId}/reverse`. It must never call `/transactions/{transactionId}/reverse`.
- Non-transfer transactions keep the existing reversal action.

Account names are not present in the transaction response, so resolve them from `qk.accounts()` with a safe fallback such as `Archived account`; do not fabricate an account DTO.

## 7. UX states and safeguards

- Fewer than two active accounts: show an explanatory empty state linking to account management.
- Confirmation copy names both accounts and the exact amount.
- Reversal confirmation explains that both ledger legs will receive compensating entries.
- Pending and retry states preserve source, destination, amount, date, description, tags, and idempotency key.
- Color is not the only direction cue; use `From`, `To`, arrows with accessible text, and signed/account labels.
- Ensure form order works one-handed on mobile: amount, from, to, description, date, optional tags.

## 8. Tests

- Unit: group two legs, incomplete groups, pagination merge, reversal groups, and unrelated same-amount transactions.
- Component: account selectors, same-account validation, grouped display, exact money formatting, and reversal confirmation.
- Hook: mandatory idempotency header, key reuse, problem mapping, and all query invalidations.
- Regression: transfer legs never receive the generic single-transaction reverse handler.
- E2E: create transfer, assert two account balance deltas and exactly two ledger legs, retry same request, reverse group, assert restored balances and invariant conservation.
- Backend integration test continues using at least five parallel identical attempts.

## 9. Out of scope

- Bank-initiated movement or payment execution; TreasuryOps records a transfer only.
- Cross-currency transfers.
- Editing transfer amount/account/date. Correction is group reversal plus a new transfer.
- Splitting one transfer across multiple destination accounts.

## 10. Definition of done

- Create idempotency is mandatory and documented.
- Transfer groups are visually and behaviorally distinct from ordinary transactions.
- Reversal always operates on `transferGroupId` and both legs.
- Integer-paise and append-only invariants are covered by UI and integration tests.
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm test:e2e` passes.
