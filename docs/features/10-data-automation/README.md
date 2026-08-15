# Data Automation

## Outcome

Improve the completeness and freshness of salary and transaction data through confirmation-based reconciliation. Preserve manual and CSV workflows, strengthen email ingestion, and treat Account Aggregator support as a later consent/security integration.

## Subfeatures

1. Salary detection and reconciliation
2. Ingestion evolution: manual, CSV, email, and future Account Aggregator

## Existing capabilities to reuse

Imports, pending transactions, API keys, recurring detection, near-duplicate logic, n8n examples, account aliases proposed in extension docs, and notification outbox.

## Product rules

- Never silently change salary profile data from a detected transaction.
- Ingestion deduplicates before ledger mutation and preserves source evidence.
- Unknown instruments go to a review inbox; the system does not guess accounts.
- Future Account Aggregator work requires an approved ADR covering consent, FIU/provider role, retention, encryption, revocation, incident response, and cost.
