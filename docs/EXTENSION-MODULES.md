# TreasuryOps — Extension Modules: Debt, Goals, Investments, Cards, Email Ingestion

> Extends `BACKEND.md` + `SALARY-MODULE.md`. Same invariants (I1–I5), same rails (withTxn, idempotency, append-only, tenancy-scoped repos, problem+json). **Design stance for every module here: model it as ledger mechanics (accounts + transactions), never as a parallel money system.** Debt, SIPs, and goals are _views over the ledger_ plus small metadata collections — that's what keeps net worth automatically correct and every number reversible.

---

## 1. Debt Module — both directions

### 1.1 Money you OWE (loans, EMIs)

**A loan is a liability account.** New account type: `'loan'` (balance is the outstanding principal, shown as negative net worth). The loan's story is then pure ledger:

```ts
// loans — metadata over the liability account
{
  _id, userId,
  accountId: ObjectId,            // the liability account this describes
  lender: string,                 // "HDFC Home Loan"
  kind: 'home' | 'personal' | 'vehicle' | 'other',
  principalMinor: number,         // original
  annualRatePct: number,          // e.g. 8.65
  rateType: 'fixed' | 'floating',
  tenureMonths: number,
  emiMinor: number,               // computed at creation, editable on rate reset
  emiDayOfMonth: number,
  startedOn: Date,
  payFromAccountId: ObjectId,     // which bank account pays the EMI
  status: 'active' | 'closed' | 'foreclosed',
  schedule: [{                    // amortization, precomputed & frozen; regenerated on prepayment/rate change (append new schedule version, keep old — same effective-dating idea as salary_versions)
    n: number, dueOn: Date,
    emiMinor, principalMinor, interestMinor, balanceAfterMinor
  }],
  scheduleVersion: number
}
```

**EMI posting (monthly cron, same rails as salary):** one atomic transaction, idempotency key `emi:{loanId}:{YYYY-MM}`, posting **the split**:

```
transfer  principalMinor   bank → loan account     (liability shrinks — this is NOT an expense)
expense   interestMinor    bank, category "Interest — HDFC Home Loan"
```

This split is the whole point of modeling loans properly: interest is real spend (shows in reports, budgets), principal is balance-sheet movement (shows in net worth). A flat "EMI expense ₹42,000" lies to both views.

**Prepayment:** manual action → transfer bank → loan account for the prepaid amount → user chooses `reduce_tenure` or `reduce_emi` → new schedule version generated (old kept), audit entry. **Rate reset (floating):** same mechanism — new schedule version effective from the reset month.

**Closure:** balance reaches 0 → status `closed`; the cron's summary logs `event:'emi.loan_closed'` and a celebratory ntfy push (earn the small joys).

### 1.2 Money OWED TO YOU (lent to friends/family)

**Each borrower is a receivable asset account** (`type: 'receivable'`), auto-created on first lend:

```
Lend ₹5,000 to Rohan     → transfer: HDFC → "Receivable: Rohan"     (net worth unchanged — correct: you swapped cash for a claim)
Rohan repays ₹2,000      → transfer: "Receivable: Rohan" → HDFC
Interest, if any          → income into HDFC, category "Interest received"
Write-off (it happens)    → expense from the receivable account, category "Written off" — honest ledger, painful button
```

```ts
// receivables — thin metadata
{
  _id, userId, accountId,
  personName: string, note?: string,
  expectedBy?: Date,               // drives a polite reminder cron (ntfy to YOU, not them)
  status: 'open' | 'settled' | 'written_off'
}
```

Dashboard widget: "Owed to you: ₹X across N people", per-person drill-down = the receivable account's transaction list. Zero new report code — it's all accounts.

---

## 2. Goals Module

Goals are **calculators over existing data** — they own no money, they read projections and balances.

```ts
// goals
{
  _id, userId,
  name: string,                    // "Kindle Paperwhite", "AM5 build", "Emergency fund"
  targetMinor: number,
  targetDate?: Date,               // optional: else "at current rate" mode
  fundingMode: 'linked_account' | 'tagged',
  linkedAccountId?: ObjectId,      // progress = account balance (e.g. a dedicated savings account)
  tag?: string,                    // progress = Σ transactions tagged #goal:am5-build
  priority: number,
  status: 'active' | 'achieved' | 'abandoned',
  startedMinor: number             // progress baseline at creation (so pre-existing balance doesn't inflate progress)
}
```

**The number he asked for — "how much to save monthly to afford X":**

```
requiredMonthly = (targetMinor − progressMinor) / monthsRemaining(targetDate)
```

…but the useful version is the **feasibility check**, which is why goals land after salary:

```
freeCashflow = incomeProjection(month)                  // salary module §7 — pure, instant
             − committedOutflows(month)                 // EMIs (loan schedules) + budgets + recurring rules + active SIPs
feasible     = requiredMonthly ≤ freeCashflow × comfortFactor (default 0.9)
```

`GET /v1/goals/:id/plan` returns requiredMonthly, feasibility, the earliest feasible date if infeasible, and what's crowding it out (top committed outflows). Multiple goals: allocation by priority with a simple waterfall — over-engineering portfolio optimization for a personal app is a trap; priority order + free cashflow is comprehensible and correct enough.

Progress recomputes in the nightly rollup job; `achieved` fires a push. No goal ever moves money — a "fund this goal" button is just a pre-filled transfer form.

---

## 3. Investments: SIPs & Stock Portfolio (scoped deliberately)

**The pushback, stated plainly:** TreasuryOps should track **contributions and valuations, not live prices**. Groww already does live NAV/P&L, and rebuilding it means quote feeds, splits, dividends, XIRR edge cases — a second product. What Groww _doesn't_ give you is your investments inside your cashflow, goals, and net worth. That's the gap TreasuryOps fills:

- **Investment accounts** (`type: 'investment'`): "Groww MF", "Groww Stocks", "PPF", "EPF" (the salary module already feeds EPF §4.3).
- **SIPs = recurring transfers** bank → investment account. Reuses the recurring engine wholesale; idempotency `sip:{ruleId}:{YYYY-MM}`; a `sip: true` flag on the rule gives the dashboard a "Monthly SIP total" widget and lets goals count SIPs as committed outflow. The investment account's balance = **cost basis** (what you've put in) — automatically, from transfers.
- **Valuations = periodic snapshots** (the one new collection):

```ts
// valuations
{ _id, userId, accountId, asOf: Date, valueMinor: number, source: 'manual' | 'import' }
```

Enter current value from the Groww app monthly (60 seconds), or later semi-automate via Groww statement export. Net worth uses `latest valuation ?? cost basis`; the dashboard shows **invested vs current** per account and overall — the honest number pair, without pretending to be a terminal.

- **PPF:** an investment account + one recurring transfer + yearly manual valuation (interest credit). Done.
- **Explicitly out (ADR it):** live quotes, holdings-level tracking, XIRR per scrip, dividend ledgers. Revisit-when: Groww ships a usable personal API _and_ you're bored.

Net-worth formula falls out for free now:

```
netWorth = Σ bank/cash/wallet balances
         + Σ investment (latest valuation ?? cost basis)
         + Σ receivables (open)
         − Σ credit card outstanding
         − Σ loan outstanding
```

One aggregation, all from accounts — because every module above stayed ledger-native. A `net_worth_snapshots` nightly cron row gives you the trend chart.

---

## 4. Credit Card Semantics (upgrade from "just an account type")

Card spends are already expenses on the card account (outstanding = negative balance). Add billing awareness:

```ts
// on accounts where type === 'credit_card'
billing: {
  statementDay: number,            // cycle close, e.g. 18
  dueDay: number,                  // e.g. 6 (of following month)
  limitMinor?: number
}
```

- **Bill payment = transfer** bank → card account (never an expense — the expense happened at swipe time; paying the bill twice-counting is the classic tracker bug, and the transfer model makes it structurally impossible).
- **Statement cron:** on statementDay, compute the cycle's spend → `event:'card.statement'` + push ("ICICI Amazon Pay: ₹18,340 this cycle, due Aug 6"). **Due-date reminders** at T-3 and T-1 if outstanding > 0 — via the outbox, like every notification.
- Dashboard: per-card outstanding, utilization vs limit, days-to-due. Interest/late fees, if ever incurred, arrive via the email parser as ordinary expenses — no special modeling.

---

## 5. Email Ingestion Spec (the n8n contract)

n8n owns email plumbing; TreasuryOps owns money. The boundary is one endpoint:

```
POST /v1/ingest/email        (API-key auth via Better Auth service key, not a session)
{
  "messageId": "...",              // Gmail Message-ID → the idempotency key. Email retries/re-reads can never double-post.
  "bank": "hdfc" | "icici" | ...,  // classified by sender domain in n8n
  "instrument": { "kind": "card" | "account", "last4": "4291" },
  "parsed": { "amountMinor": 45000, "direction": "debit",
              "merchant": "SWIGGY", "occurredAt": "...", "refNo": "..." },
  "raw": { "subject": "...", "snippet": "..." }        // for the review UI, never logged
}
```

**Account routing — never guess:**

```ts
// account_aliases
{ _id, userId, accountId, bank: 'hdfc', kind: 'card', last4: '4291' }
```

Known `last4` → post directly (source `'api'`, `meta.channel: 'email'`, category from the rule engine). Unknown → land in **`ingest_inbox`** (pending review): the UI shows "New card ending 4291 (HDFC) — ₹450 at SWIGGY. Which account?" One tap creates the alias + posts the transaction; every future email from that card routes silently. A wrong guess corrupts data quietly; a review queue costs one tap once per instrument.

**Reconciliation reuse:** email-posted transactions carry `refNo` in the dedupe hash inputs, so the monthly CSV import auto-flags them as already-present — same machinery as salary matching (§SALARY 5.1), no new code path. Salary-credit emails route into the salary matcher rather than posting a duplicate income.

n8n flow sketch (lives in your n8n LXC, versioned as exported JSON in the repo's `integrations/`): IMAP trigger → sender classifier → per-bank regex/LLM extractor → normalize to the contract → POST with retry; non-2xx lands in an n8n error branch that ntfy-pings you.

---

## 6. Onboarding: "start from current balance" (formalized)

This was always the design (`openingBalanceMinor`); here's the explicit flow so history-anxiety never blocks starting:

1. Create accounts with **today's** balances: banks (from apps), cash (count your wallet, seriously), cards (current outstanding as the opening negative), loans (current outstanding + remaining tenure → schedule generates from _today_, not origination), investments (opening valuation snapshot = current Groww value; cost basis starts from zero contributions and only tracks _future_ SIPs — the invested-vs-current pair becomes fully meaningful over time, and that's fine).
2. Day-one net worth is already correct — it needs balances, not history.
3. Backfill is **optional and safe**: importing an old CSV posts transactions _before_ the opening-balance date without touching the opening anchor (opening balance is defined _as of_ its date; the ledger sums forward from it). A settings toggle "include pre-start history in reports" keeps old data from muddying current-month views.

## 7. Phasing & Order (slots into IMPLEMENTATION-PLAN.md)

| When                            | What                                                                                                                    | Why this order                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Phase 2 (ledger core)           | `loan`/`receivable`/`investment` account **types** + card `billing` fields exist in schema                              | account types are foundational; features arrive later without migration pain                |
| Phase 4+                        | **4d — Cards & receivables** (1 wk): billing crons, lend/repay flows                                                    | pure reuse of transfer + outbox machinery                                                   |
| Phase 4+                        | **4e — Loans & EMI** (1–1.5 wk): amortization engine (most-unit-tested code after payday.service), EMI cron, prepayment | needs the recurring rails proven first                                                      |
| Phase 5+                        | **5b — SIPs & valuations** (0.5 wk) → **5c — Net worth** (0.5 wk)                                                       | trivial once account types exist                                                            |
| Phase 5/6                       | **Goals** (1 wk)                                                                                                        | needs salary projection (4a–c) + committed outflows (4d/4e) to compute feasibility honestly |
| Parallel, anytime after Phase 3 | **Email ingestion** endpoint + inbox UI; n8n flow built incrementally per bank                                          | independent seam; CSV import already proves the dedupe path                                 |

**Test additions (extends TEST-PLAN):** amortization property tests (Σ principal parts = principal exactly, to the paisa, with the rounding-remainder rule pinned; schedule regeneration on prepayment conserves outstanding), EMI double-fire → one posting, bill-payment-is-transfer invariant (a card payment must never appear in expense reports — asserted in the report tests), email `messageId` replay → exactly one txn, unknown last4 → inbox not ledger, goal feasibility math vs hand-computed spreadsheet.

---

**Summary of stance:** loans are liability accounts with the interest/principal split posted honestly; lending is a transfer to a receivable account; SIPs are recurring transfers plus valuation snapshots (contributions, not a Groww clone); goals are pure calculators over projections and committed outflows; email ingestion never guesses account routing; and you start from today's balances because a net-worth statement needs balances, not archaeology.

0008 — Self-host n8n on Proxmox for email ingestion
Context: bank-email parsing needs Gmail credentials; flow runs a few times daily.
Decision: n8n in a local LXC, LAN-only, IMAP read-only, image version pinned,
workflow JSON exported to integrations/.
Alternatives: n8n Cloud (cost + banking creds off-site — rejected),
VPS (same objection), custom Node script (rebuilding n8n's
IMAP/retry/UI for one flow — rejected).
Consequences: homelab-grade uptime is fine — polling + message-ID idempotency
self-heal after downtime.
Revisit when: flow count grows beyond banking email, or TreasuryOps ever leaves the LAN.
