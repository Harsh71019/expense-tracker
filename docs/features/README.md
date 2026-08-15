# Financial Copilot Feature Plans

## Purpose

This directory is the implementation source of truth for evolving TreasuryOps from a rear-view expense ledger into a forward-looking financial planning copilot for salaried users in India. The plans extend the existing append-only ledger; they do not replace it or create a second balance system.

The documents are deliberately split by product feature, subfeature, and delivery surface. Every subfeature has a `backend.md` and `frontend.md` plan so API, persistence, calculations, user experience, and tests can be reviewed independently without losing the shared product contract.

## Product outcome

The application should answer five questions with traceable evidence:

1. What is my current financial safety position?
2. How long can I sustain essential expenses without salary?
3. What is the single most useful financial action to take next?
4. How should the next salary be allocated without breaking existing commitments?
5. What do current saving choices imply under clearly labelled future scenarios?

## Plan index

| Order | Feature                                                                         | Outcome                                                                   | Depends on           |
| ----- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------- |
| 00    | [Architecture](./00-architecture/README.md)                                     | Cross-feature boundaries, decisions, quality gates, and delivery sequence | Existing platform    |
| 01    | [Financial profile and onboarding](./01-financial-profile-onboarding/README.md) | Versioned salary, work, protection, debt, and completeness inputs         | Profile, accounts    |
| 02    | [Safety ladder and runway](./02-safety-ladder-runway/README.md)                 | Essential burn, liquid reserves, safety stages, and recovery plans        | 01, ledger, assets   |
| 03    | [Goals and sinking funds](./03-goals-sinking-funds/README.md)                   | Indian goal templates, calculators, and feasible allocation order         | 01, 02, goals        |
| 04    | [Payday planning](./04-payday-planning/README.md)                               | Salary-day plan, spending allowance, execution checklist, and sweep       | 01-03, budgets       |
| 05    | [Wealth shield](./05-wealth-shield/README.md)                                   | Functional asset buckets, allocation drift, and flow rebalancing          | 02-04, assets        |
| 06    | [Freedom projections](./06-freedom-projections/README.md)                       | Passive-income, SIP, FIRE, and opportunity-cost scenarios                 | 01, 03, 05           |
| 07    | [Secondary income](./07-secondary-income/README.md)                             | Side-income visibility and optional wealth routing                        | 03-06                |
| 08    | [Behavioral tools](./08-behavioral-tools/README.md)                             | Life-hour and transaction reflection interventions                        | 01, ledger, 06       |
| 09    | [Financial copilot](./09-financial-copilot/README.md)                           | One evidence-backed next action and optional weekly review                | 01-08                |
| 10    | [Data automation](./10-data-automation/README.md)                               | Salary reconciliation, email ingestion, and future consented aggregation  | Existing imports, 01 |

## Status terminology

- **Existing**: implemented and expected to be reused.
- **Extension**: existing module or contract gains additive behavior.
- **New**: a new module, table, route, or frontend slice is expected.
- **Later**: documented now but blocked behind an explicit decision gate.

These plans are proposals until an implementation PR is approved. File manifests describe intended ownership; implementation may refine names, but it must update the corresponding plan when it does.

## Global implementation rules

- Integer paise for money and integer basis points for rates.
- Effective-dated versions for salary and assumptions that affect historical interpretation.
- `Asia/Kolkata` for calendar boundaries; UTC over the wire.
- Zod parsing at every HTTP, database-read, queue, configuration, and ingestion boundary.
- All user-facing reads and writes are tenant-scoped by `userId`.
- Calculators are deterministic, versioned, and covered with hand-computed fixtures.
- Recommendations are read models. Only confirmed actions may call existing idempotent ledger mutation services.
- No scheme-specific buy/sell recommendation in the initial product boundary.
- No AI-generated financial arithmetic or unsupported financial claims.
- Every route change regenerates the OpenAPI client and enters the tenancy probe suite.

## Definition of done for a subfeature

The frontend and backend plans are implemented, documentation reflects the final design, migrations are additive, API client generation is committed, and all repository gates pass:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e # when routes/auth are touched
```
