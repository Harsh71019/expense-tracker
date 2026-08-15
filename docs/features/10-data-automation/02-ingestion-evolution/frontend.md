# Ingestion Evolution — Frontend Plan

## Experience

Reuse the pending-transaction review surface for email-derived transactions. Show source, masked instrument, amount, merchant, occurrence time, dedupe/reconciliation evidence, and required account selection. Never display or retain more raw email text than necessary.

Future Account Aggregator UI is limited to a research placeholder until the backend/consent ADR is approved. It must not suggest that connection is currently supported.

## Files expected for email phase

- `apps/web/src/features/pending-transactions/components/email-ingestion-card.tsx`
- `account-alias-confirmation-sheet.tsx`
- Hooks/model tests if existing pending hooks are insufficient

## Files to edit

- Pending-transactions panel/card, account settings alias management, query keys/generated client

## States and tests

Cover unknown account, known alias, probable duplicate, salary candidate, invalid/failed ingestion, confirmed, and dismissed states. Test masking, raw-preview truncation, account selection, duplicate warning, idempotent confirm, keyboard operation, and mobile presentation.
