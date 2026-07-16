# Vyaya — Salary & Income Module Architecture

> Extends `BACKEND.md` (same invariants, same ledger, same transaction discipline). This module turns "salary" from a dumb recurring rule into a first-class, effective-dated income model that feeds cashflow, monthly income, goals, and net-worth projections — while posting into the **same append-only ledger** as everything else.
>
> **Core stance:** the salary module *describes and schedules* income; it never invents a second money system. Every rupee still lands as a normal `transactions` document via `withTxn`, reversible like anything else.

---

## 1. Why Not Just a `recurring_rule`

A plain recurring rule handles "₹X on the 1st" but breaks on the realities of a salaried income:

| Reality | What it needs |
|---|---|
| Appraisals / job changes change the amount | **Effective-dated versions**, not editing the rule in place (history must survive — same append-only philosophy) |
| CTC has structure (basic, HRA, allowances, PF, PT, TDS) | **Component line items**, gross vs net, with deductions that aren't "expenses" |
| Payday is "1st, but previous working day if weekend/holiday" | **Payday adjustment policy**, IST calendar |
| The real credit also arrives via bank CSV / n8n email | **Reconciliation** so income isn't double-counted |
| Goals & net-worth need "what will I earn next 12 months" | **Forward projection API** reading the profile, not the ledger |
| Employer PF is savings, not spend | Optional **transfer leg to an EPF account** so net worth is honest |

So: a dedicated `income` module that **reuses** the recurring engine's materialization pattern (deterministic idempotency, cron, BullMQ) but owns its own richer schema.

---

## 2. Data Model

### 2.1 `salary_profiles` — one per employer
```ts
{
  _id: ObjectId,
  userId: string,
  employerName: string,               // "Godrej Capital"
  status: 'active' | 'ended',
  creditAccountId: ObjectId,          // where net salary lands (HDFC Savings)
  incomeCategoryId: ObjectId,         // "Salary" category
  startedOn: Date,                    // joining date (drives first-month pro-ration)
  endedOn?: Date,
  paydayPolicy: {
    dayOfMonth: number,               // 1 (or 31 → "last day", clamped per month)
    adjustment: 'previous_business_day' | 'next_business_day' | 'none',
    // business-day calc uses Asia/Kolkata + a small bank-holiday table (see §6)
  },
  reconciliation: {
    mode: 'post_and_match' | 'expect_and_confirm',   // see §5 — default 'post_and_match'
    windowDays: 3,                    // credit may arrive ±N days around payday
    amountTolerancePct: 1,            // match if |actual−expected| ≤ 1%
  },
  createdAt: Date, updatedAt: Date
}
```

### 2.2 `salary_versions` — effective-dated structure (append-only, like the ledger)
A revision (appraisal, restructure) **adds a version**; nothing is edited. The version effective on the payday's month is the one that materializes.

```ts
{
  _id: ObjectId,
  profileId: ObjectId,
  userId: string,
  effectiveFrom: Date,                // first month this structure applies (IST month boundary)
  reason: 'initial' | 'appraisal' | 'revision' | 'correction',
  note?: string,                      // "July 2027 appraisal, 18% hike"

  components: [{
    key: string,                      // 'basic' | 'hra' | 'special_allowance' | 'lta' | custom
    label: string,
    kind: 'earning' | 'deduction',
    amountMinor: number,              // positive integer paise, per month
    deductionType?: 'pf_employee' | 'professional_tax' | 'tds' | 'other',
    // pf_employee is special: it's SAVINGS, not spend — see §4.3
  }],

  // Derived & frozen at write time inside the same txn (never recomputed on read):
  grossMinor: number,                 // Σ earnings
  deductionsMinor: number,            // Σ deductions
  netMinor: number,                   // gross − deductions  ← what actually credits

  createdAt: Date
}
// Index: { profileId: 1, effectiveFrom: -1 }
// Invariant I6 (module-local): netMinor === grossMinor − deductionsMinor,
// all components positive integers. Enforced by zod + Mongo JSON-schema validator.
```

**Simple mode:** a version may have exactly one earning component (`key: 'net'`) and zero deductions — Harsh can start with just the in-hand number and add structure later without any migration.

### 2.3 `salary_events` — one-offs that ride the same rails
Bonuses, arrears, joining bonus, leave encashment. Not versions (they don't repeat), not manual txns (they should carry salary semantics for reports).

```ts
{
  _id: ObjectId,
  profileId: ObjectId, userId: string,
  type: 'bonus' | 'arrears' | 'reimbursement' | 'other',
  amountMinor: number,                // net credited
  expectedOn: Date,
  status: 'scheduled' | 'posted' | 'reconciled' | 'cancelled',
  transactionId?: ObjectId,
  note?: string
}
```

### 2.4 Ledger linkage
Salary postings are **normal transactions** with provenance:
```ts
// on the transactions document (fields already exist or extend cleanly):
source: 'recurring',                       // unchanged enum
meta: {
  salary: {
    profileId, versionId, period: '2026-07',
    grossMinor, deductionsMinor,           // frozen snapshot for reports
    components: [...],                     // the line items as-of posting
  }
}
```
`monthly_rollups` gains `salaryIncomeMinor` and `grossSalaryMinor` fields (computed from `meta.salary`) so income reports can show gross vs net without re-aggregating raw docs.

---

## 3. Materialization (the cron path)

Runs inside the existing `recurring.materialize` job family — a `salary.materialize` BullMQ job at 01:00 IST daily:

```
for each active profile where computedPayday(month) <= today and not yet posted:
  version   = latest salary_versions where effectiveFrom <= monthStart
  payday    = adjust(profile.paydayPolicy, month)          // IST business-day calc
  amount    = prorate(version.netMinor, profile, month)    // §6: joining/leaving months
  idemKey   = `salary:${profileId}:${YYYY-MM}`             // deterministic — I4 applies

  withTxn:
    insert income transaction (netMinor, meta.salary snapshot, idempotencyKey: idemKey)
    $inc creditAccount.balanceMinor
    [optional §4.3] insert PF transfer legs (same txn)
    audit entry
```

- **Exactly-once:** the deterministic key + unique sparse index means a double cron fire, a crashed worker, or a manual re-run cannot double-post July's salary. Same I4 machinery as the rest of the system — tested by the same double-fire test pattern.
- **Version selection is date-pure:** posting July uses the version effective ≤ July 1 IST. Adding a version with `effectiveFrom` in the past does **not** rewrite history (already-posted months stand); it triggers an optional **arrears suggestion** (§5.4) instead. Corrections to a posted month go through the normal reversal + repost flow — never mutation.

---

## 4. What Actually Gets Posted

### 4.1 Default: one net income transaction
One ledger entry: `+netMinor` into the credit account, components preserved in `meta.salary`. Cashflow and account balance reflect reality (what the bank sees); reports can still show gross/deduction breakdowns from the snapshot.

### 4.2 Why deductions are NOT expense transactions
TDS/PT/PF-employee never touch your account — posting them as expenses would corrupt cashflow (I1 is about accounts, and no account moved). They live as metadata. The one exception:

### 4.3 Optional: PF as a transfer to an EPF asset account
If `pfAccountId` is set on the profile, materialization posts (same transaction, atomically):
```
income   +netMinor                    → HDFC Savings          (the real credit)
transfer  pf_employee amount          → EPF account            (two legs, transferGroupId)
          [optionally + employer PF as a second income+transfer pair]
```
Now net worth counts PF as the asset it is, monthly, automatically — and it's all standard ledger mechanics: reversible as a group, conserved under I1, no special cases in reporting code.

---

## 5. Reconciliation (the part that keeps income honest)

The real credit also arrives via CSV import or the n8n email parser. Without reconciliation, income double-counts. Two modes:

### 5.1 `post_and_match` (default — optimistic)
Cron posts salary on payday. When an import later stages a credit row that matches — **same account, amount within `amountTolerancePct`, date within `windowDays` of payday, direction: credit** — the import preview marks it `matched_salary` and **excludes it by default** (user can override). Match is recorded on the salary txn (`meta.salary.reconciledBy: importRowRef`) inside the commit transaction.

### 5.2 `expect_and_confirm` (conservative)
Cron creates a **pending expectation** (a `salary_events`-style doc, *no ledger entry*). The matching import row (or a one-tap confirm in the UI) posts the real transaction with the **actual** amount, tagged with the salary meta. Balance never shows money that hasn't landed. Better for irregular payers; slightly more friction.

### 5.3 Variance handling (`post_and_match`)
Actual credit ≠ expected (extra deduction, salary revision not yet entered):
- within tolerance → match, record `varianceMinor` on the salary meta (report-visible)
- outside tolerance → import row flagged `salary_mismatch`; user picks: **post adjustment** (small income/expense txn linked to the salary txn), **reverse + repost actual**, or **treat as unrelated**. Never silently absorbed.

### 5.4 Arrears suggestion
Back-dated version (e.g., appraisal effective April, entered in June) → the module computes `(newNet − oldNet) × affectedMonths` and offers a one-tap `salary_events` arrears entry for the month it actually pays out. Suggestion only — money never moves without an explicit action or the deterministic cron path.

---

## 6. Payday & Pro-ration Rules (IST, deterministic, unit-tested to death)

- **Business-day adjustment:** weekend → per policy; bank holidays from a tiny `bank_holidays` collection (seeded yearly with the ~15 national/Maharashtra dates via migration — no external API dependency for something this small).
- **`dayOfMonth: 31` semantics:** clamp to last calendar day, *then* adjust. Feb: 28/29 → previous business day if needed. Pinned by tests for every month of 2026–2028.
- **Pro-ration** (joining/leaving month): `netMinor × workedDays / calendarDays`, computed on **calendar days** by default (matches most Indian payroll), rounded to the paisa with the remainder rule documented in `money.ts`. Policy field on the profile (`prorationBasis: 'calendar_days' | 'working_days'`) because employers differ.
- All period math is IST calendar months via `common/time.ts` — the module contains zero raw `Date` arithmetic.

---

## 7. Downstream Feeds (what this module unlocks)

| Consumer | How it reads salary |
|---|---|
| **Cashflow report** | Nothing special — salary txns are ledger entries; gross/net split comes from rollup fields |
| **Monthly income view** | `GET /v1/income/summary?month=` → posted salary + events + other income, gross vs net vs variance |
| **Projections** | `GET /v1/income/projection?months=12` → *forward* schedule from active profiles/versions/events (pure function of profile data — reads zero ledger documents, so it's instant and side-effect-free) |
| **Goals module (future)** | funding plans = projection − committed budgets; "Steam Deck fund complete by Nov" is projection arithmetic |
| **Net-worth (future)** | accounts (incl. EPF via §4.3) give current worth; projection + planned SIP transfers give the forward curve |

The projection endpoint is deliberately **pure and ledger-free**: it's a calculator over profile documents. This keeps it trivially testable and means goals/net-worth features never couple to materialization internals.

---

## 8. API Surface

```
POST   /v1/income/profiles                      create profile (+ initial version, one txn)
GET    /v1/income/profiles
PATCH  /v1/income/profiles/:id                  policy/account/reconciliation fields only
POST   /v1/income/profiles/:id/end              set endedOn (final month pro-rates)

POST   /v1/income/profiles/:id/versions         append effective-dated version (appraisal)
GET    /v1/income/profiles/:id/versions         full history — the "salary timeline" view

POST   /v1/income/events                        bonus/arrears/one-off
POST   /v1/income/events/:id/cancel
POST   /v1/income/events/:id/confirm            (expect_and_confirm mode)

GET    /v1/income/summary?month=YYYY-MM
GET    /v1/income/projection?months=N
POST   /v1/income/reconcile/:txnId              manual match/variance resolution
```

All mutating routes: `Idempotency-Key`, zod DTOs from `packages/shared`, audit entries, tenancy-scoped repos — nothing new, the same rails.

## 9. Module Layout & Boundaries

```
apps/api/src/income/
├─ income.module.ts
├─ controllers/        profiles / versions / events / reports
├─ services/
│  ├─ profile.service.ts
│  ├─ version.service.ts        # append-only version writes + arrears computation
│  ├─ materializer.service.ts   # cron job body (called by scheduler module)
│  ├─ payday.service.ts         # pure: policy+month → date  (the most-unit-tested file)
│  ├─ proration.service.ts      # pure
│  ├─ reconciliation.service.ts # matching logic, called BY imports module via interface
│  └─ projection.service.ts     # pure calculator
├─ repositories/
└─ schemas/
```
- `imports` depends on `income` **only** through an injected `SalaryMatcher` interface (Nest DI token) — no deep import, per AGENTS.md §4.
- `scheduler` enqueues `salary.materialize`; the job body lives here.
- Frontend: a `features/income/` slice (profile editor with component rows, salary timeline, projection chart, reconciliation prompts in import preview) — follows FRONTEND.md rules unchanged.

## 10. Migrations, Tests, Phasing

**Migrations:** `00X-income-collections` (collections + JSON-schema validators incl. the I6 net=gross−deductions check), `00X-bank-holidays-2026-27` (seed), `00X-rollup-salary-fields` (additive fields + backfill job).

**Tests (extends TEST-PLAN.md invariants):**
- *Unit (heaviest here):* payday adjustment across every month/weekend/holiday combo 2026–2028 (property test: adjusted date is a business day within 3 days of nominal); pro-ration paisa-rounding properties; version selection at boundaries (effectiveFrom exactly on month start; two versions same month → latest `createdAt` wins, pinned); projection math.
- *Integration:* double cron fire → one posting (the I4 flagship, reused); PF-transfer posting satisfies I1 across **both** accounts + I3 pairing; reversal of a salary month reverses transfer legs atomically; back-dated version does not touch posted months; arrears computation.
- *E2E:* import a CSV containing the real salary credit after cron already posted → preview auto-excludes as `matched_salary` → commit → income counted exactly once (asserted via summary endpoint); variance path posts a linked adjustment.

**Phasing (slots into IMPLEMENTATION-PLAN.md Phase 4, split):**
- **4a — Simple salary** (fits the original Phase 4 week): profile + single-component net version + payday policy + materializer + deterministic key. *Gate:* salary posts itself exactly once on the adjusted payday.
- **4b — Structure & reconciliation** (+1 week): components, gross/net, import matching, variance flow. *Gate:* the E2E "counted exactly once" drill passes with a real statement.
- **4c — Assets & projection** (+1 week, can defer): PF transfer legs, events (bonus/arrears), projection endpoint + timeline UI. *Gate:* 12-month projection matches hand-computed spreadsheet to the paisa.

---

**Summary of stance:** versions are append-only like the ledger, materialization rides the existing exactly-once rails, deductions are metadata not fake expenses, PF is optionally a real transfer so net worth tells the truth, and reconciliation exists because the same rupee arrives twice (once predicted, once imported) and must be counted once.
