# Delivery Roadmap

## Release strategy

Deliver vertical slices that become useful independently. Do not release wealth acceleration before safety inputs and calculations are trustworthy.

| Wave | Scope                                                                             | Exit gate                                                           |
| ---- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 0    | Shared contracts, assumptions, policy/version framework, evaluation test fixtures | Reproducible engine output and architecture review                  |
| 1    | Salary/work profile and onboarding diagnostic                                     | User can enter net salary and see transparent basic statistics      |
| 2    | Essential burn, reserve sources, runway clock, and safety ladder                  | Runway matches ledger fixtures and missing-data behavior is safe    |
| 3    | Goal templates, target calculators, feasibility, and next safety action           | Plans never exceed verified free cash flow                          |
| 4    | Payday plan, guilt-free envelope, checklist, and sweep                            | Suggested and confirmed actions are separated and idempotent        |
| 5    | Wealth buckets, drift, and flow rebalancing                                       | No value is double counted and no sell instruction is generated     |
| 6    | Projection lab, bill-free meter, life-hour and cost-of-delay tools                | All assumptions are visible and scenario results reproduce fixtures |
| 7    | Secondary income and cross-feature copilot                                        | Priority rules are deterministic and explainable                    |
| 8    | Weekly review, notifications, email improvements                                  | Rules-only fallback is production-ready                             |
| 9    | Future Account Aggregator discovery                                               | Legal, consent, provider, security, and operations ADR approved     |

## Pull-request slicing

Each subfeature should normally be delivered as at least two reviewable PRs:

1. Shared contract + backend + migration + backend tests.
2. Generated client + frontend experience + frontend/E2E tests.

Calculation foundations may be a separate prerequisite PR. Migrations and deployment changes should remain isolated when repository policy requires separate review.

## Rollout controls

- Feature flags at the route/navigation level for incomplete experiences.
- Shadow evaluation before showing safety or recommendation results.
- Per-engine `formulaVersion` and per-policy `policyVersion`.
- Result comparison telemetry containing only aggregate deltas and state transitions.
- Backfills in bounded BullMQ jobs with checkpointed cursors.
- Rollback hides the feature and stops schedulers; it never deletes evaluation history or ledger records.

## Product validation

Before each wave exits, test with cold-start, stable salaried, variable-income, high-debt, underinsured, low-history, stale-valuation, and fully fortified fixtures. Human review must verify that the wording is useful without overstating certainty or shaming the user.
