# Salary and Work Profile — Backend Plan

## Scope

Store effective-dated income and work facts and return immediately useful salary statistics. Required input is net monthly in-hand salary; optional fields include annual CTC, expected annual increment, normal monthly work hours, salary credit day, income stability, and notes limited to structured labels.

## Contracts and calculations

Create shared schemas for `FinancialProfile`, `SalaryVersion`, create/update requests, version history, and `SalaryStatistics`. Suggested statistics are annualized net income, net hourly wage, net workday value, current effective salary, and configured allocation-template amounts. Integer division must define remainder allocation and never feed rounded display values back into later calculations.

Effective selection uses `effectiveFrom <= asOf`, ordered by newest effective date and stable ID. Overlapping duplicate dates are rejected per user. A correction appends a replacement version with audit context; implementation must not rewrite a version already used by a persisted plan.

## Persistence

Add `financial_profiles` for stable preferences and `salary_versions` for effective-dated salary facts. Store money in paise, rates in basis points, work time in integer minutes, and credit day as an IST calendar preference. Index `(user_id, effective_from desc, id desc)` and uniquely protect one active version per effective date.

## API

- `GET /api/v1/financial-profile`
- `PATCH /api/v1/financial-profile`
- `GET /api/v1/financial-profile/salary-versions`
- `POST /api/v1/financial-profile/salary-versions`
- `GET /api/v1/financial-profile/salary-statistics?asOf=`

Mutations require idempotency keys. Missing profile returns an explicit setup state rather than fabricated defaults; only work hours may be proposed as a client default and must be confirmed.

### As implemented

- `GET /api/v1/financial-profile` returns a `FinancialProfileState` envelope — `configured`, `profile`, `currentSalaryVersion`, `upcomingSalaryVersion`, `suggestedMonthlyWorkMinutes` (9600, the 160-hour suggestion), and `asOf` — rather than a bare profile plus a 404. An unconfigured user is a state the client renders, not an error it handles.
- `PATCH /api/v1/financial-profile` upserts the complete four-field preference set (`monthlyWorkMinutes`, `incomeStability`, and the nullable `salaryCreditDay` / `expectedAnnualIncrementBps`). The profile has no other fields, so a full replace is unambiguous and keeps the idempotency fingerprint stable; clearing an optional fact is an explicit `null`.
- Request bodies are strict: an unknown key is a 422, so a salary can never be smuggled into the profile route.
- `effectiveFrom` is normalized to the start of its `Asia/Kolkata` calendar day before storage, so "effective 1 April" is one instant regardless of the time component the client sent. The unique index therefore protects one version per user per IST calendar day.
- Failure codes: `financial_profile.not_configured` (422, statistics before setup) and `financial_profile.duplicate_effective_date` (409). Invalid salary, work minutes, credit day, and basis points are `common.validation_failed` (422) from the shared Zod schemas; an unsafe integer calculation is `money.out_of_range` (422).
- `dataQuality` is `stale` when the effective version predates `asOf` by more than 18 months, `limited` when income stability is not `stable`, and `complete` otherwise. Statistics never mutate; they are recomputed per request from the effective version.

## Files to create

- `packages/shared/src/financial-profile.ts`
- `apps/api/src/common/db/schema/financial-profile.ts`
- `apps/api/src/financial-profiles/financial-profiles.module.ts`
- `apps/api/src/financial-profiles/financial-profile.controller.ts`
- `apps/api/src/financial-profiles/financial-profile.service.ts`
- `apps/api/src/financial-profiles/financial-profile.repository.ts`
- `apps/api/src/financial-profiles/salary-statistics.ts`
- Unit and integration tests beside/in the existing test trees
- Generated additive Drizzle migration

## Files to edit

- `packages/shared/src/index.ts`
- `apps/api/src/common/db/schema/index.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/openapi/registry.ts`
- `apps/api/openapi.json` and `apps/web/src/lib/api/generated/schema.d.ts` through `pnpm gen:client`
- `apps/api/test/e2e/http-api.e2e.ts` for authenticated-route and tenancy coverage

## Tests and failure cases

Test effective-date boundaries in IST/UTC, salary history after increments, exact hourly calculation, maximum safe integers, zero/negative rejection, duplicate effective date concurrency, cross-tenant reads, idempotent replay, audit creation, and statistics before profile setup. Add a five-request concurrent creation test proving one version/effect.
