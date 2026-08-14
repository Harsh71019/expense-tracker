# Email-to-transaction ingestion (n8n)

Bank transaction emails (ICICI, HDFC) are parsed and posted into TreasuryOps automatically via an external **n8n** workflow. The deployable Code-node sources live in `n8n/`; credentials, account mappings, and network addresses remain n8n variables and are never committed.

## Flow

```
Gmail (bank alert email)
  -> n8n Gmail trigger
  -> Node 1: Parse & classify  (Code node)
  -> Node 2: Post to API + notify  (Code node)
  -> POST $TREASURY_OPS_API_BASE_URL/api/v1/transactions
  -> ntfy push (success/failure)
```

## Node 1 — Parse & classify

Input: raw Gmail message (`html`, `subject`, `id`).

1. `htmlToText` strips the HTML email body down to plain text.
2. `classify(text)` regex-matches the email against known bank templates and either:
   - marks it `skip: true` with a `reason` (see below), or
   - extracts `{ type, last4, amountMinor, occurredAt, description, template }`.
3. `last4` (the account/card's last 4 digits) is resolved to a TreasuryOps `accountId` via `TREASURY_OPS_ACCOUNT_MAP_JSON`. If the last4 isn't in the map, the row is skipped with `no_account_mapping_for_<last4>`.
4. `idempotencyKey` is a deterministic pseudo-UUID derived from the Gmail message `id` (not a real UUID v4 — just formatted to pass UUID validation), so re-processing the same email is a no-op against the API's idempotency store.
5. Amounts are converted to **paise** via `toMinor` (matches TreasuryOps' `amountMinor` integer-money convention). Dates are normalized to ISO 8601 with the `+05:30` (IST) offset.

### Supported templates

| Template             | Bank / instrument                    | Type    |
| -------------------- | ------------------------------------ | ------- |
| `hdfc_emandate_paid` | HDFC credit card autopay (e.g. Cred) | expense |
| `hdfc_upi_debit`     | HDFC UPI debit                       | expense |
| `hdfc_upi_credit`    | HDFC UPI credit                      | income  |
| `hdfc_debit_card`    | HDFC debit card swipe                | expense |
| `hdfc_credit_card`   | HDFC credit card charge              | expense |
| `icici_credit_card`  | ICICI credit card charge             | expense |

### Skip reasons

| Reason                           | Why                                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| `declined`                       | Transaction "could not be completed"                                                     |
| `upcoming_emandate`              | Advance notice of an upcoming e-mandate, not an actual debit                             |
| `cred_bill_payment`              | Cred credit-card-bill-payment confirmation (would double-count the underlying charges)   |
| `icici_bill_payment`             | ICICI "payment received" confirmation (same reason)                                      |
| `unmatched`                      | Email didn't match any known template — needs a new regex if the bank changes its format |
| `no_account_mapping_for_<last4>` | Card/account digits not present in `ACCOUNT_MAP`                                         |

## Node 2 — Post to API + notify

For each non-skipped row:

1. `POST /api/v1/transactions` on the TreasuryOps API, authenticated with a **Bearer API key** (see `apps/api/src/api-keys`), scoped to `transactions:write` (`apps/api/src/transactions/transaction.controller.ts:60`).
2. The `Idempotency-Key` header carries the pseudo-UUID from Node 1 — the API's idempotency layer (`apps/api/src/common/idempotency`) replays the original response (with an `Idempotency-Replayed: true` header) instead of double-inserting if n8n retries or re-delivers the same email.
3. Body: `{ accountId, type, amountMinor, occurredAt, description }` — matches `CreateTransactionSchema` in `packages/shared`.
4. On success: pushes an `ntfy` notification ("Transaction posted", ✅) with the signed rupee amount and description.
5. On failure: pushes an `ntfy` alert ("Transaction FAILED to post", 🚨) with the error, then rethrows so n8n marks the workflow execution as failed (visible/retryable in the n8n UI).

### Required n8n variables

| Variable                        | Example shape                                     |
| ------------------------------- | ------------------------------------------------- |
| `TREASURY_OPS_ACCOUNT_MAP_JSON` | `{"1234":"00000000-0000-4000-8000-000000000000"}` |
| `TREASURY_OPS_API_KEY`          | Scoped TreasuryOps key with `transactions:write`  |
| `TREASURY_OPS_API_BASE_URL`     | `http://treasury-ops.internal:3006`               |
| `TREASURY_OPS_NTFY_URL`         | `http://ntfy.internal:3007/treasuryops`           |

The account-map keys must be quoted four-digit strings so leading zeroes are preserved. Node 1 validates the mapping before processing mail; Node 2 validates both URLs and refuses to start when any required value is missing.

## Operational notes

- **Adding a new account/card**: update `TREASURY_OPS_ACCOUNT_MAP_JSON` with the card's quoted last four digits and the account UUID from TreasuryOps.
- **Adding a new bank/template**: add a new regex branch in `classify()`. Keep templates ordered from most-specific to least-specific pattern to avoid mis-matches.
- **API key rotation**: if the n8n workflow's key is rotated/revoked in the app's API Keys settings, Node 2 will start failing auth (401) and the ntfy failure alert will fire — check `apps/web` → API Keys page.
- **The ledger is append-only** — if a transaction is posted with wrong data, it must be corrected via a reversal entry (`POST /:transactionId/reverse`), not edited or deleted at the source. Fixing a bad parse retroactively means reversing the bad transaction, not just fixing the n8n regex going forward.
- **Completing a CRED/card-bill debit**: open the posted bank expense from Transactions and choose **Mark as credit card payment**. The app appends the missing card-side income leg through `POST /api/v1/credit-card-payments`; it does not debit the bank a second time. Bill attribution is optional, so this also works for cards without a generated open bill.
