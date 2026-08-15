# ADR-0003: Make deterministic engines authoritative

## Status

Proposed

## Context

Financial projections and recommendations must be reproducible, testable, and explainable. Language models are not reliable arithmetic engines and may introduce unsupported claims.

## Decision

Pure, versioned TypeScript calculators produce all numeric outputs and recommendation candidates. A deterministic policy engine ranks candidates. Optional AI receives a bounded evidence catalogue and may rewrite approved facts into concise prose; structural, numeric, reference, and policy validation is mandatory before display.

## Consequences

### Positive

- Results are stable across retries and independently testable.
- A rules-only fallback always exists.
- The app can show exact evidence and assumptions.

### Negative

- Policy rules and copy templates require explicit maintenance.
- Version migrations and comparison tests are necessary when formulas change.

## Alternatives considered

- LLM-generated plan: rejected because it cannot satisfy correctness and auditability requirements.
- Browser-only formulas: rejected because results could diverge across clients and avoid server-side versioning.
