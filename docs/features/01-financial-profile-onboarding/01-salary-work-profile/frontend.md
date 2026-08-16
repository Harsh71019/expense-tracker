# Salary and Work Profile — Frontend Plan

## Experience

Add a short onboarding step and a reusable settings panel. Ask for net in-hand salary first, explain why CTC is optional, show the 160-hour default as editable, and preview derived hourly/daily/annual statistics before confirmation. Never label CTC as spendable income.

## Route and rendering

Use a server component for initial profile/version/statistics loading and a client form for editing. Integrate the initial step into the dashboard zero state; keep the full editor under Settings. Salary history is a read-only timeline with an “Add change” action rather than an edit-in-place table.

## Components

- `SalaryProfileForm`: paise-safe amount inputs, work-hour input, credit-day selector, stability selector.
- `SalaryStatisticsPanel`: net annual income, hourly value, workday value, and effective date.
- `SalaryHistory`: effective-dated versions and supersession labels.
- `AddSalaryChangeSheet`: creates a future/current version with an idempotency UUID generated on mount.
- `SalaryDataNotice`: distinguishes user-entered, detected, and confirmed values.

### As implemented

- The editor lives behind a dedicated **Salary & Work** Settings tab (`/settings?tab=income`) rather than inside an existing tab: the form, statistics, history, and sheet are too much to graft onto Profile. The dashboard zero state carries a small secondary link to it.
- `SalaryWorkPanel` is the client container that composes the four planned components from server-loaded initial data; the plan's file list did not name a container.
- `SalaryDataNotice` was not built as a separate component. Only one source exists today (`manually_confirmed`), so the data-source and data-quality labels live in `SalaryStatisticsPanel`'s metadata row. Split it out when detection sources land.
- `SalaryProfileForm` shows salary and effective-date fields only while no salary version exists. Once one does, the form edits the work schedule alone and pay changes go through `AddSalaryChangeSheet` — history is append-only, so there is deliberately no inline edit path.
- Hours-to-minutes, percent-to-basis-points, and calendar-date conversions all live in `model/salary-form.ts` and return the id of the first offending field so the form can move focus to it.

## Files to create

- `apps/web/src/features/financial-profile/components/salary-profile-form.tsx`
- `apps/web/src/features/financial-profile/components/salary-statistics-panel.tsx`
- `apps/web/src/features/financial-profile/components/salary-history.tsx`
- `apps/web/src/features/financial-profile/components/add-salary-change-sheet.tsx`
- `apps/web/src/features/financial-profile/hooks/use-financial-profile.ts`
- `apps/web/src/features/financial-profile/hooks/use-salary-mutations.ts`
- `apps/web/src/features/financial-profile/server/get-financial-profile.ts`
- `apps/web/src/features/financial-profile/model/salary-form.ts`
- `apps/web/src/features/financial-profile/index.ts`
- Component, hook, and model tests

## Files to edit

- `apps/web/src/app/(app)/settings/settings-panel.tsx`
- `apps/web/src/features/insights/components/zero-state.tsx`
- `apps/web/src/lib/query/keys.ts`
- Generated API schema after backend merge

## States and accessibility

Define first-time, saved, loading, submission, duplicate-date, stale-statistics, and network-error states. Amount inputs use the owned amount component. Statistics have textual labels and never rely on color. On mobile, keep the primary action visible without obscuring fields; preserve focus when the sheet reports validation errors.

## Tests

Test INR parsing, default-versus-confirmed work hours, optional CTC, future effective dates, salary history ordering, mutation invalidation, idempotency key stability across retries, keyboard navigation, and the absence of raw hand-written fetches.
