# Spending Pattern Warnings — Frontend Proposal

**Status:** Proposal only. Do not implement until this document and the backend proposal are
reviewed and approved.

**Prerequisite:** Complete and merge
[`2026-07-24-spending-pattern-warnings-backend.md`](./2026-07-24-spending-pattern-warnings-backend.md),
including the shared zod schemas and regenerated typed API client.

**Goal:** Add a calm, accessible `/spending-warnings` page that explains unusual spending patterns
with enough evidence to be useful, without presenting them as fraud alerts or financial advice.

## 1. Experience principles

- Explain every warning with the user's comparison window and integer-money evidence.
- Prefer a short, prioritized list over a dashboard full of alarms.
- Clearly distinguish “still learning” from “no unusual patterns.”
- Link to the relevant transactions so the user can investigate with existing tools.
- Use neutral terms: “Spending patterns” for the page and “Needs attention” for severity.
- Never use color alone to communicate type or severity.
- Keep the feature useful on mobile without adding a sixth bottom-navigation item.

The first version is intentionally list-based. It does not add charts, scores, trend predictions,
budget controls, threshold settings, or external-notification preferences.

## 2. Accessibility research

- The [WAI-ARIA alert pattern](https://www.w3.org/WAI/ARIA/apg/patterns/alert/) is intended for
  important dynamic messages and notes that frequent interruptions inhibit usability. Warnings
  present at page load therefore render as normal headings and articles, not as repeated
  `role="alert"` regions.
- The
  [GOV.UK notification banner guidance](https://design-system.service.gov.uk/components/notification-banner/)
  recommends using banners sparingly and placing page-relevant information in the main content.
  The page uses one analysis-status region, then a semantic warning list.

Only the result of an interactive dismiss action uses a polite live region. Initial render,
filtering, and background refresh must not steal focus.

## 3. Route and data flow

Add an authenticated App Router route at `/spending-warnings`.

1. The server component parses supported search parameters.
2. It calls `getServerApiClient()` and fetches the first page.
3. The page passes typed initial data to the feature component.
4. TanStack Query owns client refresh, filters, pagination, and dismissal.
5. All requests use the generated client; there is no handwritten `fetch`.
6. Money is displayed through the shared money formatter/components, never by dividing by 100.

Use a feature slice:

```text
apps/web/src/features/spending-warnings/
  components/
  hooks/
  model/
  server/
  index.ts
```

Add query keys rooted at `["spending-warnings"]`, with filters represented in the list key.
Dismissal invalidates warning lists and updates the current item optimistically only if rollback
is fully tested.

## 4. Page structure

### Header

- Eyebrow: “Insights”
- H1: “Spending patterns”
- Supporting copy: “Comparisons are based on your recent posted expenses. They are not fraud
  alerts, budgets, or financial advice.”
- Optional “Last checked” timestamp when analysis exists.

### Analysis status

One compact status card explains the snapshot:

- `learning`: “Learning your patterns” with the available history/sample summary;
- `ready`: “Compared through {date}”;
- stale derived state: “Analysis is delayed” with the last successful time;
- unavailable/error: an inline retry for the read request, not a request to run analysis.

The status uses a visible heading and a normal `section`/`region`. It is not an alert banner on
initial page load.

### Filters

Keep filters intentionally small:

- All;
- Spending spikes;
- Large expenses;
- optional severity filter only if user testing shows the list needs it.

Filter values are URL search parameters so views are shareable and survive navigation. Invalid
values fall back to All.

### Warning list

Render each warning as an `article` inside a semantic list. Every card contains:

- a text label and icon for warning kind;
- “Needs attention” or “High variation” text, not just an amber/red treatment;
- one-sentence explanation;
- comparison evidence;
- time window and last detected time;
- a “Review transactions” link;
- a secondary “Not useful for this period” dismissal action.

Evidence examples:

- Overall: “₹12,400 in the last 7 days, 68% above your recent weekly median of ₹7,380.”
- Category: “Dining was ₹4,800 in 30 days, compared with a recent median of ₹2,100.”
- Large expense: “₹9,500 is above your usual range for Travel, based on 18 earlier expenses.”

Percentages are derived from integer basis points returned by the API. UI code does not recompute
detector thresholds.

### Investigation links

- overall spike → `/transactions?from=...&to=...`;
- category spike → `/transactions?categoryId=...&from=...&to=...`;
- large expense → `/transactions/{transactionId}`.

Use the existing transaction query parameter contract. If a proposed filter is not supported,
the backend/frontend implementation must add it deliberately and test it rather than generating
a dead link.

### Dismissal

Label the action “Not useful for this period,” with supporting text in the confirmation that a
later pattern may still appear.

- Generate an idempotency UUID when the dismiss control mounts.
- Reuse the same UUID for retries of that action.
- Disable the action while pending.
- On success, remove the item and announce the result in a polite live region.
- On failure, retain/restore the item and show an inline retryable error.
- Do not add a free-form reason field in the first version.

## 5. Required states

The page must have designed and tested states for:

1. **Learning:** insufficient history; explain that nothing is wrong and more posted expenses are
   needed.
2. **Ready, no warnings:** “No unusual spending patterns right now.” Do not say spending is safe.
3. **Warnings present:** bounded, filtered list with evidence and investigation links.
4. **Stale:** show the last successful timestamp while retaining available warnings.
5. **Fetch failure:** preserve the page shell and offer a read retry.
6. **Filtered empty:** explain that no warnings match the selected filter and provide “Show all.”
7. **Dismiss pending/success/failure:** stable layout, correct focus, and accessible status.
8. **Next page loading/error:** cursor pagination without duplicating or reordering existing cards.

## 6. Visual and responsive behavior

Reuse the repository's established surface, border, spacing, button, empty-state, and typography
primitives. Tailwind only; no new UI dependency.

- One readable content column, with a bounded width consistent with Reports.
- Warning cards stack on every breakpoint; comparison facts can become a two-column definition
  list on wider screens.
- Touch targets meet the existing button sizing.
- Severity uses icon + text + restrained surface treatment.
- Reserve destructive red styling for actual destructive/error states; a statistical variation
  is not an error.
- Respect the existing reduced-motion behavior.
- No sparklines or pie charts in the initial release.

## 7. Navigation

Desktop:

- add “Patterns” adjacent to Reports in the sidebar;
- update active-route behavior so nested transaction links do not mark the wrong item active.

Mobile:

- keep the existing five-item bottom navigation unchanged;
- add a prominent “Spending patterns” link/card in the Reports page header or first section.

Settings:

- optionally add a Management-tab link after the settings-tab work is merged;
- do not make Settings a prerequisite or duplicate warning preferences before preferences exist.

This keeps the page discoverable without compressing the bottom bar or hiding an existing primary
destination.

## 8. Anticipated frontend file map

Create:

- `apps/web/src/app/(app)/spending-warnings/page.tsx`
- `apps/web/src/features/spending-warnings/server/get-spending-warnings.ts`
- `apps/web/src/features/spending-warnings/hooks/use-spending-warnings.ts`
- `apps/web/src/features/spending-warnings/hooks/use-dismiss-spending-warning.ts`
- `apps/web/src/features/spending-warnings/model/filters.ts`
- `apps/web/src/features/spending-warnings/model/presentation.ts`
- `apps/web/src/features/spending-warnings/components/spending-warnings-page.tsx`
- `apps/web/src/features/spending-warnings/components/analysis-status.tsx`
- `apps/web/src/features/spending-warnings/components/warning-filters.tsx`
- `apps/web/src/features/spending-warnings/components/warning-card.tsx`
- `apps/web/src/features/spending-warnings/components/warning-list.tsx`
- `apps/web/src/features/spending-warnings/components/warning-empty-state.tsx`
- `apps/web/src/features/spending-warnings/index.ts`
- component, hook, model, route, and accessibility tests beside the relevant files;
- `apps/web/src/mocks/handlers/spending-warnings.ts`.

Modify:

- `apps/web/src/lib/query/keys.ts` and its test;
- `apps/web/src/components/app-sidebar/app-sidebar.tsx` and its test;
- `apps/web/src/features/reports/components/report-page.tsx` and its test;
- `apps/web/src/mocks/handlers/index.ts`;
- `apps/web/src/app/routes.test.tsx`;
- frontend documentation if navigation or state-management guidance changes.

The generated API client is produced by the backend phase. Frontend code must not hand-author a
parallel response type.

## 9. Implementation sequence after approval

- [ ] Confirm the merged generated client exposes list and dismiss operations.
- [ ] Add failing presentation-model tests for every discriminated warning kind.
- [ ] Add query keys, URL filter parsing, server loader, and typed hooks.
- [ ] Build the analysis-status and empty/error states.
- [ ] Build warning cards and investigation links.
- [ ] Implement idempotent dismissal with retry and accessible status.
- [ ] Add cursor pagination and filtered-empty behavior.
- [ ] Add desktop and Reports-page navigation entry points.
- [ ] Add route, responsive, keyboard, and automated accessibility tests.
- [ ] Run the complete repository quality gate.

## 10. Test plan

Model and hook tests:

- basis-point presentation and integer-money formatting;
- kind-specific evidence text;
- valid/invalid URL filters;
- typed list request and cursor handling;
- dismiss request reuses its mounted idempotency key;
- success invalidation and failure rollback;
- no duplicate pages/items during pagination.

Component and route tests:

- all eight required states;
- semantic heading order, list/article structure, and visible severity text;
- no page-loaded warning uses `role="alert"`;
- dismiss result uses a polite live region and does not steal focus;
- transaction links contain only supported filters;
- desktop navigation and mobile Reports discoverability;
- no sixth mobile bottom-navigation item;
- keyboard-only dismissal and retry.

End-to-end tests:

- server-render a populated first page;
- filter, paginate, dismiss, refresh, and confirm the episode remains hidden;
- show learning and ready-empty responses;
- show stale data without discarding existing warnings;
- authenticated route and tenancy coverage.

Required final gate:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
```

## 11. Decisions requested in review

Please approve or change these before implementation:

1. page name “Spending patterns” and route `/spending-warnings`;
2. neutral severity labels “Needs attention” and “High variation”;
3. “Not useful for this period” as the dismissal language;
4. desktop sidebar placement plus Reports-page mobile discovery;
5. keeping the first version list-based with no charts or preferences.
