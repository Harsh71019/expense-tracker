# Vyaya — Frontend: Extension Feature Slices

> Companion to `FRONTEND.md` (all rules there apply unchanged: feature isolation behind `index.ts`, generated client only, TanStack Query conventions, `<Money>`/`AmountInput` for anything monetary, URL-driven filter state, mobile-first). This doc adds the slices for `EXTENSION-MODULES.md`: **debt, goals, investments, cards, ingest inbox**, plus the dashboard and navigation changes they imply.
>
> Nothing here starts before its backend counterpart (Phase 4d+). Ship order mirrors §7 of EXTENSION-MODULES.

---

## 1. Route & Navigation Additions

```
src/app/(app)/
├─ networth/page.tsx                  # net-worth overview + trend (RSC from snapshots)
├─ debt/
│  ├─ page.tsx                        # tab view: Loans | Owed to you
│  ├─ loans/[loanId]/page.tsx         # loan detail + amortization schedule
│  └─ receivables/[id]/page.tsx       # per-person ledger (a filtered account view)
├─ goals/
│  ├─ page.tsx                        # goal cards grid
│  └─ [goalId]/page.tsx               # plan view (feasibility)
├─ investments/page.tsx               # accounts w/ invested-vs-current, SIP list
├─ cards/page.tsx                     # per-card billing overview
└─ inbox/page.tsx                     # ingest review queue
```

**Navigation:** the bottom tab bar stays five items (Home / Transactions / **Add** / Reports / More) — these screens live under **More**, except two promotions: the **inbox** gets a badge on More when non-empty (it's actionable, not browsable), and **net worth** becomes the top card on the dashboard rather than needing its own tab. Resist tab-bar inflation; the Metro screens are still add/list/dashboard.

New feature slices, standard anatomy each (`components/ hooks/ server/ lib/ index.ts`):

```
features/debt/  features/goals/  features/investments/  features/cards/  features/ingest/
```

Query keys extend `lib/query/keys.ts`: `loans()`, `loan(id)`, `receivables()`, `goals()`, `goalPlan(id)`, `investments()`, `valuations(accountId)`, `cards()`, `inbox()`, `netWorth()`.

---

## 2. `features/debt/`

### 2.1 Loans

- **`<LoanCard>`** (list): lender, outstanding `<Money>`, progress bar `paid principal / original` (this bar only moves on principal — interest doesn't count, and that's the honest visual), next EMI date + amount, closed loans collapse into a "History" section.
- **`<AmortizationTable>`** — the signature component of this slice. Reuses the ledger-row anatomy from FRONTEND §6: tabular-nums, right-aligned money columns (EMI / principal / interest / balance), the current month highlighted, past rows linking to their posted ledger transactions (`reqId`-style traceability: schedule row → real txn). Virtualized (240 rows for a home loan) with `content-visibility: auto` — no heavy table lib. Mobile: horizontal-scroll with sticky month column.
- **`<PrepayDialog>`**: `AmountInput` → calls a **preview endpoint** (`POST /v1/loans/:id/prepay?dryRun=true`) → renders both futures side by side: _reduce tenure_ ("closes Mar 2031 → Aug 2029, interest saved ₹X") vs _reduce EMI_ ("₹42,000 → ₹36,400/mo"). The choice is the confirmation — no separate "are you sure". Interest-saved is the number that motivates; lead with it.
- **`<ScheduleVersionSwitcher>`**: schedule versions (prepayments, rate resets) render as a timeline pill row; past versions are viewable read-only — same "history survives" UX as the salary timeline.
- Optimistic policy: **none for prepayment** (it regenerates a schedule — show a real pending state, invalidate `loan(id)` on settle). Optimism is for cheap reversible writes; this isn't one.

### 2.2 Receivables ("Owed to you")

- **`<LendSheet>`** — from the + on the Owed-to-you tab: person (combobox of existing receivables + free text → auto-creates the account), `AmountInput`, from-account, optional expected-by, note. One tap, one transfer under the hood.
- **`<PersonCard>`**: name, open `<Money>`, since-date, expected-by badge (amber when past). Tap → their page: the receivable account's transaction list (pure reuse of `<TxnList>` with a fixed account filter) + **Record repayment** (pre-filled reverse transfer, partial allowed) + overflow menu: _Settle_ (repayment for the full balance) and _Write off_ — which gets a deliberately heavier confirm (type the amount) because it posts a real expense and closes the claim.
- Empty state copy matters here: "Nobody owes you anything. Enjoy it."

---

## 3. `features/goals/`

- **`<GoalCard>`**: name, progress ring (SVG, animated once on mount, `prefers-reduced-motion` → static), `<Money compact>` progress/target, and the **verdict chip** — the feasibility answer rendered as one glanceable state: `On track · ₹6,500/mo` (green) / `Tight · needs ₹11,200/mo` (amber) / `Not feasible by Nov — earliest: Mar 2027` (red). The chip _is_ the feature; everything else is decoration.
- **`[goalId]` plan view**: requiredMonthly hero number, then the waterfall the backend computes — income projection bar → stacked committed outflows (EMIs, budgets, SIPs, higher-priority goals) → free cashflow remainder vs required. Rendered as a single horizontal stacked bar (`features/goals/components/CashflowWaterfall`, ~80 lines of SVG — not a recharts import for one bar), each segment tappable → navigates to the thing (the EMI's loan page, the budget). "What's crowding it out" becomes literal navigation.
- **Create flow** asks in this order: what (name), how much (`AmountInput`), by when (optional — omitting flips the card to "at current rate you'll get there by X" mode), funded how (link a dedicated account, or a `#goal:` tag with an explainer line). Priority = drag-to-reorder on the grid, not a numeric field.
- Achieved goals: confetti once (skipped under reduced-motion), then move to a collapsed "Achieved" row — trophies, not clutter.
- Data notes: `goalPlan(id)` is a pure calculator server-side → `staleTime: 5m` is fine; invalidate `goals()` on any txn/budget/SIP mutation (added to the central invalidation lists — review-checklist item, same as FRONTEND §4.2).

---

## 4. `features/investments/`

- **`<InvestmentRow>`** per account: name, **invested vs current** as the honest pair — `₹1,20,000 → ₹1,34,500 (+12.1%)` — with the delta colored but _not_ celebrated (no arrows, no ticker energy; this is a ledger, not a terminal — deliberate design restraint per the Groww-scope ADR).
- **`<ValuationPrompt>`**: the design problem of this slice is making the monthly manual valuation _frictionless_. Solution: a first-of-month inbox-style card on the dashboard — "Update Groww MF value? Last: ₹1,34,500 (34 days ago)" → tapping opens `AmountInput` pre-focused, submit, gone. Staleness indicator on rows: valuation > 45 days old renders the current-value side greyed with "as of 12 Jun". Never nag beyond the one card.
- **`<ValuationSparkline>`** per account + tap-through to a history list (each snapshot deletable — it's `source:'manual'` data, typos happen; this is the one place delete is honest because valuations aren't ledger money).
- **SIP list**: recurring rules with `sip: true`, monthly total headline, next-run dates, pause/resume. Creating a SIP is the recurring-rule form with the flag set and to-account constrained to investment type — reuse, not a new form.

## 5. `features/cards/`

- **`<CardTile>`**: outstanding `<Money>`, utilization bar vs limit (amber > 30%, red > 70%), **due-in-N-days** countdown chip (red ≤ 3 days with amount), statement-cycle dates. Tap → the card account's txn list with a cycle filter pre-applied ("this statement" / "last statement" chips — cycle boundaries from `billing`, computed client-side from the same shared date utils the backend uses).
- **`<PayBillButton>`** → pre-filled transfer sheet (from default bank account, amount = outstanding, editable for partial). It's the transfer form with a costume on — no new mutation, and the UI copy says "record payment" not "pay" (Vyaya records; your bank pays).
- Statement history: past `card.statement` events as rows (cycle range, total, paid-by-due ✓/✗).

## 6. `features/ingest/` (the review inbox)

- **`<InboxItem>`**: "New card •• 4291 (HDFC) — ₹450 at SWIGGY, yesterday" + account picker (existing accounts of matching kind, or "create new card account" inline) + category chip row (rule-engine suggestion preselected) + Confirm / Ignore.
- Confirm = one mutation: create alias + post txn (backend does both atomically); the item animates out and a toast notes "future 4291 emails will post automatically" — teaching the system's behavior at the exact moment it's learned.
- **Badge propagation:** inbox count rides on the session/bootstrap query → badge on More tab. New-item push (ntfy) deep-links `vyaya://inbox` (PWA URL handler).
- Ignore keeps the item queryable under a filter (never silently deletes someone's money signal); a third action "Not a transaction" trains nothing but clears honestly.
- This screen is also where email-parse _failures_ surface (n8n error branch → inbox with `raw.snippet` shown) — one place to review everything the automation wasn't sure about. That's the trust contract of §5 of the backend doc, made visible.

## 7. Dashboard & Net Worth

Dashboard (RSC, streaming) gains, in order: **net-worth card** (headline `<Money compact>`, 6-month sparkline from snapshots, tap → /networth), then the existing balance/budget cards, then conditional cards that render only when actionable — card due ≤ 7 days, valuation prompt (first-of-month), inbox items pending, goal at risk (feasibility flipped since last rollup). _Conditional_ is the discipline: a dashboard of permanent widgets is a dashboard nobody reads.

`/networth` page: the formula visualized — assets stacked bar (banks / investments / receivables) vs liabilities (cards / loans) with the net line, trend chart from `net_worth_snapshots` (recharts, dynamic-imported — this page is the chart budget's customer), and per-account drill rows. Time range chips (3m / 6m / 1y / all) in searchParams, per URL-state rules.

## 8. Testing Additions (frontend slice of TEST-PLAN)

- **Component:** AmortizationTable renders paisa-exact against a golden schedule fixture (shared with backend tests — same JSON file, so frontend and backend can't disagree about the schedule); PrepayDialog dry-run flow with MSW; verdict chip states from fixture plans; ValuationPrompt staleness logic; InboxItem confirm → optimistic removal → rollback on 422.
- **Visual:** loan card, verdict chips (3 states), invested-vs-current row, card tile at each utilization band — added to the Storybook/screenshot suite.
- **E2E:** lend → partial repay → settle (balances asserted via API); create goal → post SIP → plan updates; inbox confirm → alias works (second simulated email posts silently); record card payment → expense reports unchanged (the bill-payment-is-transfer invariant, asserted from the UI side too).
- Perf: /networth joins the Lighthouse budget routes; the amortization page must stay under the 150KB first-load budget (virtualized table, no table lib — that's why).

## 9. Ship Order (mirrors backend §7)

| Backend phase                     | Frontend work                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------- |
| 4d cards & receivables            | `features/cards/`, `features/debt/` receivables half, dashboard due-date card |
| 4e loans & EMI                    | loans half: LoanCard, AmortizationTable, PrepayDialog                         |
| 5b/5c SIPs, valuations, net worth | `features/investments/`, /networth, dashboard net-worth card                  |
| 5/6 goals                         | `features/goals/` incl. waterfall                                             |
| any time post-3                   | `features/ingest/` + badge plumbing                                           |

Each lands only after its backend gate — the frontend never mocks a module into existence ahead of the API; MSW is for tests, not for pretending.
