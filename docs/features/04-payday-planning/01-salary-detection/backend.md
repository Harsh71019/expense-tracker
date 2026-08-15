# Salary Detection — Backend Plan

## Scope

Convert recurring income-stream evidence into a confirmation candidate for the financial profile. Detection never mutates salary versions or creates duplicate ledger income.

## Candidate rules

Reuse recurring detection to find stable monthly income streams. Candidate evidence contains transaction IDs, normalized counterparty fingerprint, cadence, median/min/max paise, confidence basis points, and last occurrence. Reject streams already linked to a salary version or explicitly dismissed for the current detector version.

## API

- `GET /api/v1/financial-profile/salary-candidates`
- `POST /api/v1/financial-profile/salary-candidates/:candidateId/confirm`
- `POST /api/v1/financial-profile/salary-candidates/:candidateId/dismiss`

Confirmation creates a salary version through the existing profile service with the user-selected effective date and amount. It never posts another income transaction.

## Files to create

- Shared salary-candidate schemas
- `apps/api/src/financial-profiles/salary-candidate.service.ts`
- `apps/api/src/financial-profiles/salary-candidate.repository.ts`
- Candidate confirmation tests

## Files to edit

- Detected recurring-stream schema/service only for a narrow read port
- Financial-profile controller/module, OpenAPI/client, E2E probe

## Tests

Test duplicate salary transactions, variable amounts, multiple employers, candidate dismissal/versioning, concurrent confirmation, cross-tenant candidate ID, no duplicate ledger write, and confirmed version effective date.
