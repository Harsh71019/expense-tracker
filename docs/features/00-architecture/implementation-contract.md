# Implementation Contract

## Shared response envelope expectations

Every calculated result should expose enough metadata to reproduce and explain it:

```ts
{
  computedAt: Date,
  sourceThrough: Date,
  formulaVersion: number,
  policyVersion: number,
  dataQuality: "complete" | "limited" | "stale" | "unavailable",
  limitations: string[],
  assumptions: { /* schema specific, rates in basis points */ },
  result: { /* schema specific, money in integer paise */ },
  evidence: { /* bounded identifiers and aggregates */ }
}
```

Concrete Zod schemas, rather than a generic untyped envelope, must define each route. The shape above is a consistency requirement, not a request to introduce `Record<string, unknown>` responses.

## Calculation conventions

- Salary planning uses net in-hand income. Optional annual CTC is reserved for protection ratios.
- `amountMinor` is always integer paise; rates use integer basis points.
- Projection contribution timing and compounding convention are explicit inputs.
- Display rounding never feeds subsequent calculations.
- Historical calculations select the salary/assumption version effective on the evaluated date.
- Transfers, reversals, and reversed transactions do not count as expense burn.
- Only posted essential expenses count toward essential burn.
- A reserve source must be explicitly eligible and sufficiently liquid; net worth alone is not emergency liquidity.
- Insurance cover is a protection fact, never an asset or net-worth component.

## API conventions

- New routes live under `/api/v1/` and are registered in the OpenAPI registry.
- Mutations require an `Idempotency-Key`; duplicate requests return the original result.
- List routes use cursor pagination even when the first release expects few rows.
- Controllers parse, invoke one service operation, and map the response.
- Domain errors map to RFC 7807 through the global filter.
- Repository methods require `userId` first and filter every access by it.

## Persistence conventions

- Financial facts that change interpretation over time are effective-dated.
- Evaluation snapshots are append-only and keyed by user, evaluation kind, period/input fingerprint, and engine version.
- Plans are immutable once issued. A changed input generates a superseding plan rather than mutating financial recommendations in place.
- Metadata mappings may be updated when they do not rewrite ledger history; every mutation is audited.
- New schema changes use generated, additive Drizzle migrations.

## Frontend conventions

- Server components load the initial authenticated result through server loaders.
- Client components own interaction, scenario editing, mutations, and live visualization.
- Canonical finance results come from the API. Client-side calculations are limited to presentation geometry and explicitly shared pure helpers.
- Each view defines loading, empty, partial-data, stale, error, and success states.
- Color never communicates safety alone; every tier has a label, icon or text, and accessible description.
- Scenario outputs say “illustrative,” show their assumptions, and avoid guaranteed language.

## Test contract

Every calculation ships with:

- Table tests based on hand-computed fixtures.
- Boundary tests for zero, one-paisa, maximum safe integer, missing history, and date transitions.
- Property or invariant tests where conservation or monotonicity applies.
- Repository tenancy tests.
- Service tests for eligibility and priority rules.
- Integration tests for every table or transactional orchestration.
- At least five concurrent identical attempts for idempotent mutations.
- Route/E2E tests for authenticated endpoints and generated-client compatibility.

## Observability contract

Structured events include engine version, policy version, duration, input row counts, data-quality state, and outcome kind. They exclude salary values, insurance amounts, debt values, transaction descriptions, raw provider prompts, and personal identifiers.
