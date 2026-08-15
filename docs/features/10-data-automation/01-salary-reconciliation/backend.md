# Salary Reconciliation — Backend Plan

## Scope

Link detected/imported salary transactions to confirmed salary profile versions and payday plans without posting duplicates. Reconciliation distinguishes expected, observed, late, missing, variable, and corrected salary occurrences.

## Model and flow

Extend recurring occurrence/reconciliation metadata or add a focused `salary_occurrences` table referencing the source transaction and salary version. Matching uses amount tolerance, expected IST window, normalized counterparty, and payment rail; ambiguous matches require review.

The system never changes a transaction amount/type/account. Profile amount changes require explicit confirmation and a new effective-dated version.

## API

- `GET /api/v1/financial-profile/salary-reconciliations`
- `POST /api/v1/financial-profile/salary-reconciliations/:id/resolve`

## Files to create

- Shared reconciliation schemas
- Salary matching/reconciliation repository/service tests
- Additive schema/migration if existing recurring reconciliation cannot safely own it

## Files to edit

- Financial-profile module/controller, recurring reconciliation read ports, payday plan source linkage, OpenAPI/client/E2E probe

## Tests

Test exact/variable/late/missing/ambiguous salary, CSV/email duplicate, concurrent resolution, wrong-tenant transaction, profile-version creation only after consent, and unchanged ledger invariants.
