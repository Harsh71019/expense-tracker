# Vyaya — Personal Expense Tracker: Backend Architecture

> **Stack:** Next.js (frontend) · NestJS + Node.js 24.18 LTS (API) · MongoDB Atlas (M0 → M10) · Mongoose · Better Auth · BullMQ + node-cron · Deployed on Proxmox LXC behind NPMplus
>
> **Design goals:** atomic & revertible money operations, CSV/manual/API ingestion, single-user today but multi-user-ready, boring-reliable crons, portfolio-grade code quality.

---

## 1. High-Level Architecture

```
┌─────────────────────────── Proxmox Host ───────────────────────────┐
│                                                                     │
│  ┌──────────────┐   ┌──────────────────────────────────────────┐   │
│  │  LXC: proxy  │   │  LXC: vyaya                              │   │
│  │  NPMplus     │──▶│  ┌────────────┐   ┌────────────────────┐ │   │
│  │  + CrowdSec  │   │  │ Next.js    │   │ NestJS API :4000   │ │   │
│  └──────────────┘   │  │ (SSR) :3000│──▶│  ├ Auth (Better    │ │   │
│                     │  └────────────┘   │  │   Auth)          │ │   │
│  ┌──────────────┐   │                   │  ├ REST modules    │ │   │
│  │ LXC: infra   │   │  ┌────────────┐   │  ├ Cron scheduler  │ │   │
│  │ Redis        │◀──┼──│ BullMQ     │◀──│  └ Import pipeline │ │   │
│  │ (queues)     │   │  │ worker     │   └─────────┬──────────┘ │   │
│  └──────────────┘   │  └────────────┘             │            │   │
│                     └──────────────────────────────┼────────────┘   │
│  ┌──────────────┐                                  │                │
│  │ LXC: n8n     │── (optional: bank-email parser ──┘ via API)       │
│  └──────────────┘                                  │                │
└────────────────────────────────────────────────────┼────────────────┘
                                                     ▼
                                        MongoDB Atlas (replica set)
                                        + nightly mongodump → NAS
```

**Why this shape:**

- **Modular monolith, not microservices.** One NestJS app with strict module boundaries (`auth`, `accounts`, `transactions`, `imports`, `budgets`, `reports`, `scheduler`). You get microservice-style separation for the portfolio narrative without the operational tax. Each module could be extracted later — that _is_ the scalability story.
- **API separate from Next.js.** Next.js stays a pure frontend (server components call the API over the LAN). This keeps the backend independently testable, lets n8n/scripts hit the same API, and mirrors real enterprise topology.
- **Redis + BullMQ** for anything long-running (CSV parsing, report generation) so HTTP requests stay fast. On a single-user system this is arguably overkill — include it because it costs little on your homelab and it's the correct pattern at scale.
- **Atlas over self-hosted Mongo:** transactions require a replica set; Atlas M0 gives you one for free, with backups and zero ops. Your Proxmox box already has enough pets.

---

## 2. Data Model

All money is stored as **integer paise** (`amountMinor: 125050` = ₹1,250.50). Never floats. Currency fixed to INR now, field kept for future-proofing.

### 2.1 Collections

#### `users` (managed by Better Auth) + `user_profiles`

```ts
// user_profiles — app-owned extension of the auth user
{
  _id: ObjectId,
  userId: string,            // Better Auth user id
  displayName: string,
  locale: 'en-IN',
  timezone: 'Asia/Kolkata',
  createdAt: Date, updatedAt: Date
}
```

#### `accounts` — where money lives

```ts
{
  _id: ObjectId,
  userId: string,
  name: string,              // "HDFC Savings", "ICICI Credit Card", "Cash"
  type: 'bank' | 'credit_card' | 'cash' | 'wallet' | 'investment',
  currency: 'INR',
  openingBalanceMinor: number,
  // balanceMinor is a DERIVED CACHE, updated inside the same txn as writes.
  // Source of truth is always SUM(transactions). A nightly cron re-verifies.
  balanceMinor: number,
  isArchived: boolean,
  createdAt: Date, updatedAt: Date
}
```

#### `categories`

```ts
{
  _id: ObjectId,
  userId: string,
  name: string,              // "Food", "Commute", "Gym", "Homelab"
  parentId?: ObjectId,       // one level of nesting is plenty
  kind: 'expense' | 'income',
  icon?: string, color?: string,
  isArchived: boolean
}
```

#### `transactions` — the ledger (append-only)

```ts
{
  _id: ObjectId,
  userId: string,
  accountId: ObjectId,
  categoryId?: ObjectId,
  type: 'expense' | 'income' | 'transfer',
  amountMinor: number,           // always positive; sign derives from type
  currency: 'INR',
  occurredAt: Date,              // when the money moved
  description: string,
  tags: string[],
  source: 'manual' | 'csv_import' | 'recurring' | 'api',   // provenance

  // ---- transfer linkage (see §3.3) ----
  transferGroupId?: ObjectId,    // both legs of a transfer share this

  // ---- revertibility (see §3.2) ----
  status: 'posted' | 'reversed' | 'reversal',
  reversalOf?: ObjectId,         // set on the compensating entry
  reversedBy?: ObjectId,         // set on the original when reversed

  // ---- import lineage ----
  importBatchId?: ObjectId,
  dedupeHash?: string,           // sha256(userId|accountId|date|amount|normalizedDesc)

  // ---- idempotency ----
  idempotencyKey?: string,       // unique sparse index; client-supplied

  createdAt: Date, updatedAt: Date
}
```

**Indexes**

```js
{ userId: 1, occurredAt: -1 }                          // main list view
{ userId: 1, accountId: 1, occurredAt: -1 }            // per-account view
{ userId: 1, categoryId: 1, occurredAt: -1 }           // per-category reports
{ userId: 1, dedupeHash: 1 }  (unique, sparse)         // import dedupe
{ idempotencyKey: 1 }         (unique, sparse)         // write idempotency
{ importBatchId: 1 }                                   // batch revert
{ transferGroupId: 1 }                                 // transfer pairing
```

#### `import_batches` — CSV imports as a first-class, revertible unit

```ts
{
  _id: ObjectId,
  userId: string,
  accountId: ObjectId,
  filename: string,
  fileHash: string,              // sha256 of raw file — reject exact re-uploads
  mapping: {                     // saved column mapping, reusable per bank
    date: 'Txn Date', amount: 'Amount', description: 'Narration',
    dateFormat: 'DD/MM/YYYY', amountConvention: 'single_signed' | 'debit_credit_cols'
  },
  status: 'staged' | 'committed' | 'reverted' | 'failed',
  stats: { total: number, staged: number, duplicates: number, committed: number },
  committedAt?: Date, revertedAt?: Date,
  createdAt: Date
}
```

#### `staged_rows` — parse target before commit (TTL-expired)

```ts
{
  _id: ObjectId,
  batchId: ObjectId,
  rowNumber: number,
  raw: Record<string, string>,
  parsed?: { occurredAt: Date, amountMinor: number, type: string, description: string },
  suggestedCategoryId?: ObjectId,   // rule-based now; embeddings later (see §8)
  problems: string[],               // ["unparseable date", ...]
  isDuplicate: boolean,
  include: boolean                  // user can untick rows in preview
}
// TTL index: expire staged rows 7 days after creation
```

#### `recurring_rules` — templates the cron materializes

```ts
{
  _id: ObjectId,
  userId: string,
  template: { accountId, categoryId, type, amountMinor, description, tags },
  rrule: string,                 // e.g. "FREQ=MONTHLY;BYMONTHDAY=1" (rrule lib)
  nextRunAt: Date,               // cron queries this — indexed
  lastRunAt?: Date,
  isPaused: boolean
}
```

#### `budgets`

```ts
{
  _id: ObjectId,
  userId: string,
  categoryId: ObjectId,
  period: 'monthly',
  limitMinor: number,
  alertThresholds: [0.8, 1.0]    // notify at 80% and 100%
}
```

#### `monthly_rollups` — materialized reports (cron-maintained)

```ts
{
  _id: ObjectId,
  userId: string,
  month: '2026-07',
  byCategory: [{ categoryId, spentMinor, incomeMinor, txnCount }],
  byAccount:  [{ accountId, netMinor }],
  totalExpenseMinor: number, totalIncomeMinor: number,
  computedAt: Date
}
```

#### `audit_log`

```ts
{
  _id: ObjectId,
  userId: string,
  action: 'txn.create' | 'txn.reverse' | 'import.commit' | 'import.revert' | ...,
  entityId: ObjectId,
  meta: object,                  // before/after snapshots for edits
  at: Date
}
```

---

## 3. Atomicity & Revertibility (the core design)

### 3.1 Every money write is a MongoDB multi-document transaction

Atlas runs as a replica set even on M0, so `session.withTransaction()` works everywhere. Wrap it once in a helper and never call `startSession` in business code:

```ts
// common/mongo-txn.ts
export async function withTxn<T>(
  conn: Connection,
  fn: (session: ClientSession) => Promise<T>
): Promise<T> {
  const session = await conn.startSession();
  try {
    // withTransaction auto-retries on TransientTransactionError
    return await session.withTransaction(fn, {
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" }
    });
  } finally {
    await session.endSession();
  }
}
```

A single "create expense" then atomically does **all three or none**:

```ts
await withTxn(conn, async (session) => {
  const [txn] = await TransactionModel.create([doc], { session });
  await AccountModel.updateOne(
    { _id: doc.accountId, userId },
    { $inc: { balanceMinor: -doc.amountMinor } },
    { session },
  );
  await AuditModel.create([{ action: 'txn.create', entityId: txn._id, ... }], { session });
  return txn;
});
```

**Rules that keep transactions healthy:**

- Keep them short: no HTTP calls, no file I/O, no CSV parsing inside a session. Parse first, transact last.
- Batch commits in chunks of ~200 docs per transaction (Mongo caps txn size at 16MB oplog entry; chunking also bounds retry cost).
- `readConcern: snapshot` + `writeConcern: majority` = no torn reads, no rollback on failover.

### 3.2 Revert = compensating entry, never delete

The ledger is **append-only**. "Undo" writes a mirror-image transaction and links the pair:

```
Original:  { _id: A, type: 'expense', amountMinor: 50000, status: 'posted' → 'reversed', reversedBy: B }
Reversal:  { _id: B, type: 'income',  amountMinor: 50000, status: 'reversal', reversalOf: A }
```

Both writes + the balance `$inc` + audit entry happen in one transaction. Why this instead of `deleteOne`:

1. **History survives.** You can always answer "what did I do last Tuesday and why is the balance what it is."
2. **Reports are trivially correct** — reversals net out in aggregations; alternatively filter `status: 'posted'` for clean views.
3. **It's the pattern banks/NBFCs actually use** (you'll recognize this at Godrej: no one deletes ledger rows). Great interview material.
4. **Idempotent and safe under concurrency** — reversing an already-reversed txn is rejected by a status guard inside the transaction.

**Edits** follow the same rule: an edit = reverse original + post corrected entry, linked in `audit_log` with before/after. (Allow direct in-place edit only for non-monetary fields: description, tags, category.)

### 3.3 Transfers are two legs, one atom

"Move ₹10,000 from HDFC to Cash" creates two transactions sharing a `transferGroupId` (expense leg + income leg), both balance updates, all in one Mongo transaction. Reverting a transfer reverts **both legs** — the API only accepts `transferGroupId` for transfer reverts, never a single leg.

### 3.4 Idempotency

Every mutating endpoint accepts an `Idempotency-Key` header (client generates UUID per logical action; the Next.js form generates it on mount, so a double-tap on a jittery train connection can't double-post). Unique sparse index on `idempotencyKey` — the second attempt fails the insert inside the transaction, the API catches the duplicate-key error and returns the original result with `200` instead of `201`. Cheap, bulletproof, and exactly the pattern payment APIs use.

---

## 4. CSV Import Pipeline (staged, previewable, batch-revertible)

Manual entry is fine on the Metro, but monthly statement dumps are where this earns its keep.

```
POST /imports (multipart CSV + accountId)
   │  reject if fileHash already committed
   ▼
[BullMQ job: parse]                     ← csv-parse (streaming), never in the request cycle
   │  per row: normalize date/amount → compute dedupeHash
   │  dedupe against BOTH existing transactions and rows within the file
   ▼
staged_rows (+ batch.status = 'staged')
   │
   ▼
GET /imports/:id/preview                ← UI shows parsed rows, flags dupes/problems,
   │                                       lets you untick rows & fix category guesses
   ▼
POST /imports/:id/commit
   │  chunks of 200 rows, each chunk = one Mongo transaction:
   │    insert transactions (source:'csv_import', importBatchId, dedupeHash)
   │    $inc account balance by chunk net
   │  batch.status = 'committed' only after ALL chunks succeed;
   │  a mid-way crash leaves status 'staged' + partial rows, and commit is
   │  RESUMABLE: re-running skips rows whose dedupeHash already landed.
   ▼
POST /imports/:id/revert                ← one bulk reversal, chunked transactions,
                                          reverses every posted txn with this batchId,
                                          batch.status = 'reverted'
```

**Details that matter for Indian bank CSVs:**

- **Column mapping is saved per account** (`import_batches.mapping`), so HDFC's `Txn Date / Narration / Withdrawal Amt / Deposit Amt` is a one-time setup. Support both single-signed-amount and separate debit/credit column conventions.
- **Date parsing:** enforce explicit `dateFormat` from the mapping (`DD/MM/YYYY` default) — never auto-guess, that's how 04/07 becomes April 7th.
- **`dedupeHash` = sha256(userId|accountId|date(day)|amountMinor|normalizedDescription)**. Normalized = lowercased, whitespace-collapsed, UPI ref numbers stripped. Same-day identical transactions (two ₹20 chai UPIs) are flagged as _possible_ dupes in preview rather than silently dropped — user decides.
- **n8n hook:** your existing HDFC/ICICI email-parser flow can `POST /transactions` directly (source: `'api'`, with idempotency key = bank ref number). CSV and email ingestion converge on the same dedupe logic, so overlap between the two is handled automatically.

---

## 5. Auth — Better Auth

**Recommendation: [Better Auth](https://better-auth.com)** — TypeScript-native, framework-agnostic, has a MongoDB adapter, and works cleanly in the "separate Next.js frontend + Node API" topology. It gives you out of the box:

- Email/password with proper hashing (scrypt), rate-limited login
- **Passkeys plugin** — Face ID login on your iPhone 16 Plus from the train, no typing
- Cookie-based sessions (httpOnly, secure, sameSite) with rotation — better fit than JWTs here since there's one API and you want server-side revocation
- 2FA (TOTP) plugin if you expose this to the internet rather than Tailscale-only

**Topology:** Better Auth mounts _inside the NestJS app_ (it exposes a fetch-style handler you adapt to Express at `/api/auth/*`). One process owns users + sessions + business data — no token relay between Next.js and the API.

```ts
// auth/better-auth.instance.ts
export const auth = betterAuth({
  database: mongodbAdapter(db),
  emailAndPassword: { enabled: true },
  plugins: [passkey(), twoFactor()],
  advanced: { cookiePrefix: "vyaya" },
  trustedOrigins: ["https://vyaya.yourdomain.tld"]
});

// auth/auth.guard.ts — NestJS guard used on every controller
@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) throw new UnauthorizedException();
    req.user = session.user;
    return true;
  }
}
```

Next.js uses the Better Auth **client SDK** for login/register/passkey UI and just forwards cookies on server-component fetches. Since it's personal: disable public signup after creating your account (`disableSignUp: true`), and consider keeping the whole thing LAN/Tailscale-only with NPMplus access lists as a second wall — CrowdSec then only matters if you ever expose it.

**Multi-tenancy discipline (even for one user):** every query in every service goes through a repository layer that injects `userId` from the session. No handler ever receives `userId` from the request body. This costs nothing now and is the entire multi-user migration.

---

## 6. Cron Jobs & Background Work (the Proxmox dividend)

Scheduling via `@nestjs/schedule` for triggers, but **every job body runs through BullMQ** so jobs are retryable, observable (Bull Board dashboard), and survive process restarts. All schedules in `Asia/Kolkata`.

| Job                     | Schedule                | What it does                                                                                                                                                                                                                              |
| ----------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recurring.materialize` | `0 1 * * *` (01:00)     | Finds `recurring_rules` with `nextRunAt <= now`, posts each templated txn **in its own transaction**, advances `nextRunAt` via rrule in the same txn. Idempotency key = `ruleId + scheduledDate` so a crashed run can't double-post rent. |
| `rollups.refresh`       | `0 2 * * *` (02:00)     | Recomputes current + previous month `monthly_rollups` via aggregation pipeline. Dashboard reads rollups, never raw aggregation.                                                                                                           |
| `balances.verify`       | `0 3 * * 0` (Sun 03:00) | Recomputes every account balance from `SUM(transactions)` and compares to the cached `balanceMinor`. Any drift → GlitchTip alert. This is the self-auditing safety net for the derived cache.                                             |
| `budgets.alert`         | `0 8 * * *` (08:00)     | Evaluates budget thresholds against rollups; sends ntfy/Telegram push ("Food at 84% with 9 days left").                                                                                                                                   |
| `backup.dump`           | `0 4 * * *` (04:00)     | `mongodump` from Atlas → your NAS, gzip, keep 30 dailies + 12 monthlies. Atlas M0 has no PITR — this cron **is** your backup strategy. Test restore quarterly.                                                                            |
| `staging.sweep`         | TTL index               | Mongo TTL index expires `staged_rows` after 7 days — no cron needed.                                                                                                                                                                      |
| `month.report`          | `0 9 1 * *`             | Renders last month's summary (top categories, MoM delta, biggest txns) → ntfy/email.                                                                                                                                                      |

---

## 7. API Surface (REST)

All routes behind `AuthGuard`; validation via `zod` schemas shared with the frontend (`packages/shared` in the monorepo). Errors follow RFC 7807 problem+json.

```
POST   /transactions                    create (Idempotency-Key required)
GET    /transactions?from&to&accountId&categoryId&q&cursor   cursor-paginated
PATCH  /transactions/:id                non-monetary fields only
POST   /transactions/:id/reverse        compensating entry
POST   /transfers                       two-leg atomic transfer
POST   /transfers/:groupId/reverse

POST   /imports                         upload CSV (multipart)
GET    /imports                         batch history
GET    /imports/:id/preview             staged rows + dupe flags
PATCH  /imports/:id/rows/:rowId         toggle include / fix category
POST   /imports/:id/commit
POST   /imports/:id/revert

GET    /accounts | POST /accounts | PATCH /accounts/:id
GET    /categories | POST /categories | PATCH /categories/:id
GET    /recurring | POST /recurring | PATCH /recurring/:id
GET    /budgets | PUT /budgets/:categoryId

GET    /reports/monthly/:month          reads monthly_rollups
GET    /reports/cashflow?from&to
GET    /export/csv?from&to              your data back out, always

/api/auth/*                             Better Auth handler
GET    /healthz                         liveness (Beszel/uptime checks)
```

Cursor pagination (`occurredAt + _id` compound cursor), not offset — offset paginating a growing ledger degrades and skips rows under concurrent writes.

---

## 8. NestJS Module Layout

```
apps/api/src/
├─ main.ts                    helmet, cookie-parser, pino-http, zod filter
├─ app.module.ts
├─ auth/                      Better Auth instance + guard + decorators
├─ common/                    withTxn, idempotency interceptor, problem+json filter,
│                             pagination utils, money utils (paise ↔ display)
├─ accounts/                  controller / service / repository / schemas
├─ categories/
├─ transactions/              + reversal.service.ts, transfer.service.ts
├─ imports/                   + parser.processor.ts (BullMQ), dedupe.service.ts
├─ recurring/
├─ budgets/
├─ reports/                   aggregation pipelines + rollup reader
├─ scheduler/                 cron definitions → enqueue BullMQ jobs
└─ notifications/             ntfy/Telegram adapter
```

Conventions: controllers do HTTP only; services own business rules and transactions; repositories own Mongoose and always take `userId`. `pino` structured logs shipped to your existing **GlitchTip** for error tracking; `/healthz` watched by **Beszel**.

**Future GenAI hooks (deliberate seams, not scope creep):**

- `suggestedCategoryId` in staging is rule-based today (`description contains "SWIGGY" → Food`); the seam is designed so an embedding-based classifier (or a small LLM call) can replace the rule engine later — that's your RAG-adjacent portfolio extension.
- A `/reports/ask` endpoint ("how much did I spend on commute vs last quarter?") over the rollups is a clean LangChain/LangGraph.js showcase on real personal data.

---

## 9. Deployment & Ops (Proxmox)

- **LXC (Debian 12, 2 vCPU / 2GB)** running Docker Compose: `api`, `web`, `worker`. Redis runs as separately managed shared infrastructure; each application receives its own authenticated URL, database number, and key prefix. Images are built by a GitHub Action, pulled via `docker compose pull && up -d` (or Watchtower, which you already know from the arr-stack).
- **NPMplus** vhost `vyaya.yourdomain.tld` → web:3000, `/api` → api:4000; CrowdSec in front if internet-exposed, otherwise Tailscale-only and skip the drama.
- **Config:** `.env` in the LXC (Atlas URI, Better Auth secret, ntfy topic); never in the repo. Atlas network access: allow only your home IP / use a static egress via your router, plus a dedicated DB user scoped to this database.
- **Observability you already run:** Beszel (container metrics + healthz), GlitchTip (API + worker error tracking), Bull Board mounted at `/admin/queues` behind auth.
- **Backups:** the §6 mongodump cron to NAS + your existing NAS backup routine. The database _is_ the product here — this is the one ops task that isn't optional.

## 10. Build Order

| Phase                          | Scope                                                                               | Definition of done                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **1. Ledger core** (wk 1–2)    | Auth, accounts, categories, manual txns with transactions + reversal, balance cache | Can log chai on the Metro and undo it; balance always reconciles    |
| **2. CSV pipeline** (wk 3–4)   | Upload → stage → preview → commit → revert; HDFC + ICICI mappings                   | Import a real statement, revert the whole batch, re-import clean    |
| **3. Automation** (wk 5)       | Recurring rules, rollups, budget alerts, backup cron, verify cron                   | Rent auto-posts on the 1st exactly once; ntfy pings at 80% budget   |
| **4. Reports & polish** (wk 6) | Monthly report, cashflow, CSV export, passkeys, monthly summary push                | Face-ID login; month-end summary lands on your phone                |
| **5. GenAI layer** (later)     | Embedding-based categorizer, `/reports/ask` NL queries                              | The interview story: "production ledger + RAG over my own finances" |

---

# PART II — Enterprise Hardening (Cross-Cutting Concerns)

## 11. API Versioning & Contracts

- **URI versioning:** everything under `/v1/...` from day one (`app.enableVersioning({ type: VersioningType.URI })`). Cheap now, impossible to retrofit cleanly later.
- **OpenAPI as a build artifact:** `@nestjs/swagger` generates the spec; CI publishes it and fails if a change breaks the previous spec (breaking-change detection via `oasdiff`). The Next.js client is generated from the spec (`openapi-typescript`) — frontend/backend drift becomes a compile error, not a runtime bug.
- **Shared zod schemas** in `packages/shared` remain the single source of truth: zod → DTO validation at runtime, zod → OpenAPI via `zod-openapi`, zod → TS types at compile time. One definition, three enforcement points.

## 12. Configuration & Secrets

- **Fail-fast env validation:** a `zod` schema parses `process.env` at bootstrap; a missing `ATLAS_URI` kills the process at startup with a named error, never a 3 a.m. `undefined` deep in a request.
- **Secrets:** you already run **Vaultwarden** — keep the canonical copies there; deploy-time injection via `sops`-encrypted `.env` in the repo (age key lives only on the LXC) or Docker secrets. Rule: plaintext secrets exist only inside the container's env, never in git, never in images.
- **Config tiers:** `local` (mongodb-memory-server) / `staging` / `prod` — same image, different env. No `if (NODE_ENV === ...)` branches in business code.

## 13. Database Discipline

- **Migrations:** `migrate-mongo` with versioned, ordered migration files (indexes, JSON-schema validators, backfills). CI runs migrations against an ephemeral replica set; deploy runs them before the new API version boots (compose `depends_on` a one-shot migrate container). Rule: **no index or validator is ever created by application code or by hand in Atlas.**
- **Server-side JSON Schema validators** on `transactions` and `accounts` as a second wall behind zod — catches any future script/n8n write that bypasses the API. `validationLevel: 'moderate'` so old docs don't block migrations.
- **Connection hygiene:** maxPoolSize tuned (10 is plenty), `serverSelectionTimeoutMS: 5000`, retryable writes on. A `/readyz` endpoint checks Mongo + Redis ping — Beszel watches `/healthz` (liveness), compose healthcheck watches `/readyz` (readiness).
- **Seed & fixtures:** idempotent seed script (default categories, demo account) used by local dev, staging, and e2e tests alike.

## 14. Resilience & Correctness Under Failure

- **Graceful shutdown:** on SIGTERM — stop accepting HTTP, let in-flight requests finish (10s budget), pause BullMQ workers after current job, close Mongo/Redis, exit 0. NestJS `enableShutdownHooks()` + explicit BullMQ `worker.close()`. This is what makes deploys zero-drama.
- **Outbox pattern for notifications:** budget alerts and monthly reports are written to a `notification_outbox` collection **inside the same transaction** as the state change that triggered them; a worker drains the outbox with retries. Guarantees you never get an alert for a rollback, and never lose one to a crashed process. (Small pattern, enormous interview mileage.)
- **Dead-letter queue:** BullMQ jobs that exhaust retries land in a DLQ visible in Bull Board + GlitchTip alert. `imports` jobs are the main customer.
- **Circuit breaker on outbound calls** (ntfy/Telegram): 5 failures → open 60s → half-open probe. A down notification service must never back-pressure the ledger.
- **Clock discipline:** LXC syncs NTP; all cron idempotency keys use `Asia/Kolkata` _calendar dates_, not timestamps, so a DST-less IST is still explicit and a re-run at 01:05 can't differ from 01:00.

## 15. Security Hardening

- **Rate limiting:** `@nestjs/throttler` backed by Redis — global 100 req/min per session, `POST /v1/auth/*` 10/min per IP, `POST /v1/imports` 5/hour. In front of that, NPMplus + CrowdSec if internet-exposed.
- **Upload hardening:** 5 MB CSV cap, MIME + extension check, row cap (50k), cell length cap, **formula-injection neutralization on export** (prefix `=`, `+`, `-`, `@` cells with `'`) — the classic CSV export vuln everyone forgets.
- **Headers & sessions:** helmet defaults, strict CORS (single origin), Better Auth cookies `httpOnly + secure + sameSite=strict`, session rotation on privilege change.
- **AuthZ tests as a first-class suite:** every repository method takes `userId`; the test plan (§TESTING.md) includes a dedicated cross-tenant probe suite that tries to read/write another user's data through every endpoint. This suite existing is the multi-user readiness proof.
- **Supply chain:** Renovate bot on the repo, `npm audit` + `trivy` image scan in CI (fail on critical), lockfile committed, Docker base images pinned by digest.
- **Audit completeness:** every mutating endpoint writes `audit_log` in-transaction; audit entries are write-once (no update/delete route exists, JSON-schema validator forbids mutation).

## 16. Observability (upgrade from "logs + GlitchTip")

- **Correlation:** `x-request-id` accepted-or-generated per request, propagated into BullMQ job data, present on every pino log line and audit entry. One id traces a CSV row from upload → parse job → commit txn → audit.
- **OpenTelemetry:** auto-instrumentation for HTTP/Mongoose/BullMQ/Redis exporting OTLP → a tiny **Grafana LGTM stack** (or just Tempo+Grafana) in an `observability` LXC. Traces answer "why was commit slow" without printf debugging.
- **Metrics:** `/metrics` Prometheus endpoint — RED metrics per route, queue depth/latency, txn retry count, balance-drift gauge (from the Sunday verify cron; **alert if ever non-zero**), import success ratio.
- **SLOs (yes, for one user — they're the point):** p95 write < 150 ms LAN, p95 dashboard read < 100 ms (rollup-backed), import commit of 1k rows < 30 s, error budget: zero balance-drift events.
- **Log retention:** pino → Loki, 30 days; audit_log in Mongo is permanent (it's data, not logs).

## 17. Performance & Scalability Posture

- **Read path:** dashboard reads hit `monthly_rollups` + Redis cache (60s TTL, busted on write via key `user:{id}:reports:*`). Raw aggregations only for ad-hoc date ranges.
- **Write path:** target is human-scale (single-digit writes/sec) but tested to 200 writes/sec in k6 — headroom is proven, not assumed.
- **Known scale levers, in order, if ever needed:** Atlas M0→M10 (more RAM/IOPS) → move worker to its own LXC → read-model denormalization → shard by `userId` (schema is already shard-key-ready since every index is `userId`-prefixed). Documenting the levers _is_ the scalability plan; pulling them early is waste.
- **Query budget in CI:** an integration test runs `explain()` on the 5 hottest queries and fails if any becomes a COLLSCAN — index regressions caught before deploy.

## 18. Environments, CI/CD & Release

```
dev (laptop, mongodb-memory-server) → staging (LXC, Atlas db: vyaya-stg) → prod (LXC, Atlas db: vyaya)
```

- **CI (GitHub Actions):** lint + typecheck → unit → integration (ephemeral replset) → e2e (testcontainers: app+redis) → build images → trivy scan → push GHCR → auto-deploy staging.
- **Prod deploy:** manual approval → SSH deploy step runs `migrate && compose pull && compose up -d` → smoke test hits `/readyz` + one write/reverse cycle against a canary account → rollback = redeploy previous tag (images are immutable, migrations are additive-only by policy).
- **Release hygiene:** conventional commits, changelog generated, every image tagged with git SHA; `/healthz` returns the running SHA so "what's deployed" is one curl.

## 19. Disaster Recovery (runbook, not vibes)

- **RPO: 24h** (nightly mongodump; tighten to 1h later via Atlas M10 PITR if this ever holds money-critical data). **RTO: 1h** — documented restore: new Atlas cluster → `mongorestore` → update env → redeploy.
- **Quarterly restore drill** (calendar reminder): restore latest dump to `vyaya-drill` db, run the balance-verify job against it, confirm zero drift, tear down. A backup that's never been restored is a rumor.
- **Failure matrix documented in-repo:** LXC dies (rebuild from compose + env from Vaultwarden, ~20 min), Atlas region outage (wait — accepted risk for personal), NAS dies (dumps also rclone'd to B2/Drive weekly), repo dies (GitHub + local remote).
