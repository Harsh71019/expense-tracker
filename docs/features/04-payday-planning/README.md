# Payday Planning

## Outcome

Generate a versioned, safety-first plan for each salary period: commitments, emergency allocation, goal allocation, long-horizon allocation, and a guilt-free spending ceiling. Let the user confirm steps without claiming the app moved bank funds.

## Subfeatures

1. Salary detection and confirmation
2. Allocation plan and execution checklist
3. Guilt-free spending envelope
4. Month-end leftover sweep

## Existing capabilities to reuse

Recurring detection, transactions, transfers, budgets, goals, bills, recurring rules, notifications, idempotency, audit, and IST time utilities.

## Product rules

- 50/30/20 is an editable template, never a universal judgment.
- Mandatory commitments and safety deficits are resolved before wealth candidates.
- A plan is immutable once issued; input changes generate a superseding plan.
- Checklist completion is either linked to a posted ledger action or explicitly marked as an external/manual action.
- No external bank execution is implied.
