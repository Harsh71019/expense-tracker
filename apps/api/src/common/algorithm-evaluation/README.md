# Finance algorithm evaluation harness

This directory is a pure, read-only foundation for later finance algorithms. It does not query the
database, enqueue work, expose routes, persist results, or mutate the ledger.

## Historical evaluation

- `buildChronologicalHoldout()` hides only the newest labeled periods.
- `buildRollingOriginPlan()` creates expanding training windows and fixed future horizons.
- Input time buckets must be strictly increasing. Duplicate periods must be aggregated or given a
  domain-defined ordering before evaluation, so a target can never share a time bucket with its
  training data.
- `maxOrigins` is a hard resource ceiling. When it binds, the newest complete decision windows are
  retained and `skippedOriginCount` reports the omitted older origins.

## Synthetic fixture

`buildSyntheticPersonalFinanceHistory()` produces 24 months by default from an integer seed. All
narrations, counterparties, accounts, IDs, and truth labels are synthetic. The versioned fixture
contains salary working-day shifts, rent, groceries with aliases and changing references,
biweekly service, annual membership, variable utility, category correction, travel and medical
shocks, equal legitimate purchases, missing and delayed recurrences, transfers, reversals,
credit-card purchases/statements/payments, changed-card grocery spending, and gradual/abrupt
regime changes. A minimum of 18 months is required so every scenario remains present.

## Decision metrics

Metrics use integer counts, integer paise, whole days, and basis points. Sums and differences use
`bigint` before narrowing. Empty denominators return `null`, not a misleading zero.

- categorization: top-1 precision, coverage, and amount-weighted accuracy;
- recurrence: mature-stream precision/recall, next-date/amount MAE, missed-payment lead time, and
  accepted/rejected/unreviewed rates;
- forecast: MAE, MASE versus the caller's baseline, non-zero event precision/recall, empirical
  interval coverage, and mean interval width;
- shortfall: event precision/recall, warning lead time, and first-shortfall-date MAE;
- budget: breach precision/recall, useful lead time, and late-warning count;
- warnings: confirmed usefulness, dismiss rate, unresolved count, and total amount at risk.

Shared zod contracts in `packages/shared/src/algorithm-evaluation.ts` define algorithm/policy
versions, input watermarks, sufficiency/abstention, shadow/canary comparisons, and observable
lookback/row/batch/runtime/degraded-mode budgets. Comparison contracts contain aggregate metric
deltas only; they have no user, narration, account, or transaction identifier fields.
