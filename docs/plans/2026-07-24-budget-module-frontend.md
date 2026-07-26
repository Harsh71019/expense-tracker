# Budget Module — Frontend Proposal

**Status:** Proposal only. Do not implement until this document and the backend proposal are
reviewed and approved.

**Prerequisite:** Complete and merge
[`2026-07-24-budget-module-backend.md`](./2026-07-24-budget-module-backend.md), including the
shared zod schemas and regenerated typed API client.

**Goal:** Add a clear `/budgets` experience for setting monthly category limits and comparing
current actual spending with those limits.

## 1. Experience principles

- Always show actual paise-derived spending beside the planned amount.
- Treat budgets as user-chosen planning tools, not judgments or financial recommendations.
- Explain the exact-category and current-month scope before the user saves.
- Show spending over a limit as information that can be acted on, not as a destructive error.
- Distinguish unbudgeted spending from remaining budget.
- Keep create/edit/archive flows short and usable on a phone.
- Use text and money values with every visual meter; never rely on color alone.

The page does not recommend a limit. It may link to reports for historical context, but the user
chooses the number.

## 2. Research and accessibility basis

- The CFPB's
  [managing-spending guidance](https://files.consumerfinance.gov/f/documents/201702_cfpb_Consumer-Tips-on-Managing-Spending.pdf)
  recommends comparing actual category spending with the budget monthly or more frequently.
- The CFPB's
  [spending assessment](https://www.consumerfinance.gov/owning-a-home/prepare/assess-your-spending/)
  recommends reviewing several months and adjusting unrealistic assumptions. The UI should offer
  a Reports link, not an automated prescription.
- The W3C
  [meter pattern](https://www.w3.org/WAI/ARIA/apg/patterns/meter/) defines a meter as a numeric
  value within a known range and recommends an accessible name plus human-readable value text.
  Budget utilization is a meter, not task-completion progress.
- The
  [GOV.UK notification-banner guidance](https://design-system.service.gov.uk/components/notification-banner/)
  recommends using banners sparingly and putting directly relevant information in normal page
  content.

The initial page uses normal sections/cards. Saving or archiving may use a polite live status;
page-loaded over-budget items do not become repeated alerts and do not steal focus.

## 3. Route and data flow

Add authenticated route `/budgets`.

1. The server component fetches the first budget page and active categories in parallel.
2. It uses the generated server API client only.
3. Typed initial data hydrates TanStack Query.
4. Client hooks handle pagination, upsert, archive, and restoration.
5. Mutation forms generate an idempotency UUID on mount and reuse it for retries.
6. Successful mutations invalidate budgets; categories and transaction lists remain unchanged.
7. All returned data is parsed through shared zod schemas.

Feature slice:

```text
apps/web/src/features/budgets/
  components/
  hooks/
  model/
  server/
  index.ts
```

Query keys:

- `qk.budgets()` root;
- `qk.budgetLists()`;
- `qk.budgetList({ includeArchived, limit })`.

## 4. Page structure

### Header

- Eyebrow: “Planning”
- H1: “Monthly budgets”
- Current IST month in human-readable form.
- Supporting copy: “Set limits for individual expense categories and compare them with posted
  spending this month.”
- Primary action: “Add budget”.

Include a small scope note:

> A budget counts posted expenses assigned directly to that category. Transfers and reversed
> transactions do not count.

### Overview

Use four compact facts:

- planned across active budgets;
- spent in budgeted categories;
- signed remaining;
- unbudgeted spending.

Each value uses shared money components. If total remaining is negative, label it “Over planned
amount” rather than displaying a confusing negative “Remaining.”

The overview is derived from backend totals across all budgets, not the currently loaded page.

### Budget list

Cards are ordered predictably from the API and can be locally grouped:

- Needs attention: approaching/reached;
- On track;
- Inactive, when requested.

Each active card shows:

- category icon/name;
- spent and limit amounts;
- remaining or over amount;
- utilization percentage derived from returned basis points;
- accessible meter;
- text status: “On track,” “Approaching limit,” or “Limit reached”;
- link to current-month transactions filtered by category;
- Edit and Archive actions.

The visual fill clamps at 100%, while visible text may say “126% used.” The meter's
`aria-valuenow` remains within its min/max, and `aria-valuetext` provides the full meaning, for
example “₹6,300 spent of ₹5,000; ₹1,300 over the monthly limit.”

Do not use red as the only reached-state signal. Use icon, label, amount, and restrained color.

### Empty states

No budgets:

- explain that a budget is an optional planning limit;
- offer “Add your first budget”;
- link to Reports to review prior category spending.

No eligible categories:

- explain that an active expense category is required;
- link to Categories.

No spending:

- show the configured limits with ₹0 spent; do not replace the list with an empty page.

### Inactive budgets

An optional “Show inactive” control requests archived configurations.

- An archived budget can be restored by editing/saving a new limit.
- A budget attached to an archived category is read-only and explains that the category is no
  longer active.
- Historical alert events are not shown in the first release.

## 5. Add and edit flow

Use the existing card/form language and shared `AmountInput`; no new UI dependency.

Fields:

- expense-category selector;
- monthly limit.

Create:

- list only active expense categories;
- mark categories that already have a budget and route selection into edit rather than creating a
  duplicate;
- explain that adding mid-month includes eligible spending from the first day of this month.

Edit:

- category is read-only;
- show current spent amount beside the input;
- explain that changing the limit immediately recalculates utilization;
- save through `PUT /v1/budgets/:categoryId`.

Validation:

- positive amount only;
- safe integer paise through the shared parser;
- inline error linked to the field;
- error summary only when multiple fields can fail;
- submit cannot use a stale pre-blur `AmountInput` value.

On success, keep focus near the edited card and announce a concise polite status. On failure,
preserve the entered value and display the RFC 7807 message.

## 6. Archive and restore

Archive is recoverable but materially changes planning, so use a concise confirmation:

> Archive this budget? It will stop appearing in current totals and threshold checks. Transactions
> are not changed.

- Generate and reuse an idempotency UUID.
- Disable the action while pending.
- Do not optimistically remove the card unless rollback is fully tested.
- Return focus to the next logical heading/card after success.
- Restore through the edit/save flow with a new limit.

Never use “delete budget,” because the backend preserves the configuration and alert evidence.

## 7. Navigation and dashboard integration

Desktop:

- add “Budgets” adjacent to Reports in the sidebar.

Mobile:

- keep the existing five-item bottom navigation unchanged;
- add a “Monthly budgets” section/link on Home;
- also link from Reports near category spending.

Home:

- fetch a small budget page server-side;
- show total planned/spent and up to three approaching/reached categories;
- if none exist, show a quiet setup prompt;
- link to the full page.

The Home integration makes the module useful daily without turning the navigation bar into six
compressed destinations.

## 8. Alerts in the UI

The budget page itself is the reliable user-facing status surface.

- Show the fixed 80% and 100% policy as explanatory copy.
- Do not promise push/Telegram/ntfy delivery while the backend uses the logging adapter.
- Do not expose notification-channel preferences in this module.
- Page-loaded threshold states are ordinary content, not `role="alert"`.
- A mutation outcome may use one `aria-live="polite"` region.

If a real notification adapter is approved later, delivery preferences and channel status need a
separate contract and settings design.

## 9. Responsive and visual behavior

- Single-column cards on phones; overview facts become a two-column grid when space allows.
- Keep category, amounts, meter, and primary action visible without horizontal scrolling.
- Use tabular numerals for amounts/percentages.
- Provide a textual value beside every meter.
- Touch targets follow existing button sizing.
- Meter fills respect reduced motion.
- No pie charts, sparklines, or forecast lines in the first release.
- Tailwind and existing primitives only.

## 10. Anticipated frontend file map

Create:

- `apps/web/src/app/(app)/budgets/page.tsx`
- `apps/web/src/features/budgets/server/get-budgets.ts`
- `apps/web/src/features/budgets/hooks/use-budgets.ts`
- `apps/web/src/features/budgets/hooks/use-budget-mutations.ts`
- `apps/web/src/features/budgets/model/presentation.ts`
- `apps/web/src/features/budgets/components/budgets-page.tsx`
- `apps/web/src/features/budgets/components/budget-overview.tsx`
- `apps/web/src/features/budgets/components/budget-card.tsx`
- `apps/web/src/features/budgets/components/budget-meter.tsx`
- `apps/web/src/features/budgets/components/budget-form.tsx`
- `apps/web/src/features/budgets/components/budget-empty-state.tsx`
- `apps/web/src/features/budgets/components/inactive-budgets.tsx`
- `apps/web/src/features/budgets/index.ts`
- `apps/web/src/mocks/handlers/budgets.ts`
- model, hook, component, route, and accessibility tests beside relevant files.

Modify:

- `apps/web/src/lib/query/keys.ts` and test;
- `apps/web/src/components/app-sidebar/app-sidebar.tsx` and test;
- `apps/web/src/app/(app)/page.tsx` or a new dashboard feature slice;
- `apps/web/src/features/reports/components/report-page.tsx` and test;
- `apps/web/src/mocks/handlers/index.ts`;
- `apps/web/src/app/routes.test.tsx`;
- frontend architecture documentation.

The generated client and response types come from the backend phase. Do not define parallel
frontend-only API shapes.

## 11. Implementation sequence after approval

- [ ] Confirm the merged generated client exposes list, upsert, and archive operations.
- [ ] Add failing presentation tests for utilization, remaining/over, and meter text.
- [ ] Add query keys, server loader, and typed query/mutation hooks.
- [ ] Build page header, overview, and required empty/error states.
- [ ] Build accessible cards/meters and transaction drill-down links.
- [ ] Build add/edit validation with mounted idempotency keys.
- [ ] Build archive/restore with confirmation and focus management.
- [ ] Add pagination and inactive-budget behavior.
- [ ] Add sidebar, Home, and Reports discoverability.
- [ ] Add responsive, keyboard, route, e2e, and automated accessibility coverage.
- [ ] Run the complete repository quality gate.

## 12. Test plan

Model/hook tests:

- basis-points-to-percentage presentation without money arithmetic;
- under/approaching/reached and over-limit labels;
- meter clamping plus full accessible value text;
- current-month category transaction URLs;
- list pagination without duplicate cards;
- idempotency key reuse on mutation retry and renewal after success;
- mutation failure preserves form values;
- invalid response fails shared-schema parsing.

Component/route tests:

- no-budget, no-category, zero-spend, active, over-limit, inactive, and error states;
- signed overview totals and unbudgeted-spending explanation;
- exact-category/current-month scope copy;
- category selector excludes income/archived categories;
- edit cannot submit a stale amount;
- archive confirmation says transactions are unchanged;
- page-loaded threshold cards do not use alert roles or move focus;
- color is not the only state indicator;
- desktop navigation and mobile Home/Reports entry points;
- bottom navigation still has five items.

End-to-end:

- create a budget and see existing current-month spend immediately;
- edit the limit and see utilization recalculate;
- add/reverse an expense and see progress increase/decrease correctly;
- transfer legs do not change budget progress;
- archive and restore;
- cross-tenant access remains unavailable;
- keyboard-only form and archive flows;
- axe has no serious/critical violations.

Required final gate:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
```

## 13. Decisions requested in review

Please approve or change these before implementation:

1. page name “Monthly budgets” and route `/budgets`;
2. exact-category, current-month-only presentation;
3. live progress and unbudgeted-spending overview;
4. fixed 80% and 100% policy shown as informational status;
5. desktop sidebar plus Home/Reports mobile discovery;
6. no charts, rollover, historical comparisons, or notification settings initially.
