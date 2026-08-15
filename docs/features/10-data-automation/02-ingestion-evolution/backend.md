# Ingestion Evolution — Backend Plan

## Scope

Preserve manual and CSV input, formalize email ingestion review, and document—not implement—the future Account Aggregator boundary.

## Email phase

Normalize n8n input into a strict shared contract with message ID, bank, instrument kind/last4, amount paise, direction, occurred date, reference number, and bounded raw preview. Authenticate through scoped API keys. Known aliases route through pending/dedupe/reconciliation; unknown aliases remain in review. Never log raw subject/snippet.

Add account aliases and durable ingestion inbox only if current pending-transaction schema cannot represent the review lifecycle. Message ID and provider reference form idempotency/dedupe evidence. Slow parsing remains outside transactions.

## Future Account Aggregator gate

Do not implement until an ADR approves FIU/provider arrangement, consent artefact lifecycle, data minimization, encryption, revocation/deletion, refresh scheduling, retention, incident response, supported FIPs, cost, and reconciliation semantics. No credential scraping fallback.

## Files expected for email phase

- `packages/shared/src/email-ingestion.ts`
- Account-alias/ingestion schema and additive migration if needed
- `apps/api/src/pending-transactions/email-ingestion.controller.ts`
- Email ingestion service/repository/normalizer tests
- Versioned n8n workflow export under an approved integration directory

## Files to edit

- API-key scopes, pending-transactions module, near-duplicate/reconciliation inputs, env schema/example only for new secrets, OpenAPI/client/E2E probes

## Tests

Test message replay, unknown last4, alias tenancy, duplicate CSV later, invalid MIME/size boundaries where applicable, raw-data logging prohibition, scoped API-key denial, five concurrent deliveries, and exactly one ledger effect after confirmation.
