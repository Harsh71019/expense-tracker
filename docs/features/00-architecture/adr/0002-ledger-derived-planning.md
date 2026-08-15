# ADR-0002: Keep planning derived from the ledger

## Status

Proposed

## Context

Runway, goal progress, salary allocation, wealth buckets, and side-income statistics all describe money that already exists in accounts, assets, or transactions. Persisting independent balances for these features would cause drift and violate ledger correctness.

## Decision

New features may persist metadata, assumptions, mappings, plans, and immutable evaluation snapshots. They must read monetary truth from existing accounts, assets, valuations, transactions, bills, budgets, recurring commitments, and goals. Confirmed money movement delegates to existing ledger services.

## Consequences

### Positive

- Net worth, cash flow, runway, and plans share one auditable source.
- Reversals and imports automatically flow into later evaluations.
- No reconciliation process is needed between “planner money” and ledger money.

### Negative

- Some reads require carefully bounded aggregation or precomputed snapshots.
- Earmarking part of a general account is metadata, not a new balance, and must be explained clearly.

## Alternatives considered

- Separate envelope balances: rejected because they create a parallel money system.
- Manual-only safety amounts: allowed only as explicitly low-confidence onboarding data, never as canonical reserve value.
