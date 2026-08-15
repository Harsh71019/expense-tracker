# Financial Profile and Onboarding

## Outcome

Collect the minimum trusted facts needed to interpret the ledger: net in-hand salary, optional CTC, work schedule, recurring income stability, insurance protection, high-cost debt, and data completeness. This feature produces statistics immediately while clearly separating user-entered facts from ledger-derived facts.

## Product rules

- Net in-hand salary drives budgets, payday plans, savings rate, affordability, and life-hour calculations.
- Annual CTC is optional and used only for protection ratios or explicitly labelled CTC statistics.
- Salary changes are effective-dated; never overwrite history.
- Default work hours are 160 per month but always visible and editable.
- The initial diagnostic may use user estimates, but derived calculations replace them as ledger history becomes sufficient.
- Do not silently accept a detected salary or alter profile facts.

## Subfeatures

1. [Salary and work profile](./01-salary-work-profile/backend.md)
2. [Protection and debt profile](./02-protection-debt-profile/backend.md)
3. [Onboarding diagnostic](./03-onboarding-diagnostic/backend.md)

## Existing capabilities to reuse

`user-profiles`, Better Auth, accounts, categories, transactions, recurring detection, shared money formatting, generated API client, settings UI, and the current dashboard zero state.

## Release boundary

This feature stores facts and derives basic statistics. It does not recommend a security, move money, calculate runway before reserve sources are configured, or infer missing insurance/debt answers as safe.
