# Vyaya — Phased Implementation Plan

> Companion to `BACKEND.md`. Sized for ~8–10 focused hrs/week (weeknights + one weekend block) alongside the Godrej job. Each phase ends with a **gate** — a demo you can actually run. No phase starts until the previous gate passes. Commute time (Malad–Vikhroli) is budgeted for _reading/design/review tasks only_, never coding.

---

## Phase 0 — Foundations (Week 1) · "Empty app, enterprise skeleton"

The unglamorous phase that makes every later phase fast. Do not skip; do not gold-plate.

**Tasks**

1. Monorepo scaffold: `pnpm` workspaces — `apps/api` (NestJS), `apps/web` (Next.js), `packages/shared` (zod schemas, types), `packages/config` (eslint/tsconfig).
2. Tooling: TypeScript strict, ESLint + Prettier, husky + lint-staged, conventional commits + commitlint.
3. Config module: zod-validated env, fail-fast bootstrap, `local/staging/prod` tiers.
4. Logging: pino + pino-http, `x-request-id` middleware, redaction of auth headers.
5. Health: `/healthz` (liveness + git SHA), `/readyz` (Mongo/Redis ping).
6. Docker: multi-stage Dockerfiles (distroless runtime), `compose.yml` (api, web, worker, redis), local `compose.dev.yml`.
7. CI v1 (GitHub Actions): lint → typecheck → unit → build. Trivy + Renovate wired.
8. Atlas: create cluster, `vyaya` + `vyaya-stg` databases, scoped DB users, IP allowlist.
9. `migrate-mongo` wired with migration `001-init-indexes` (empty for now, proves the pipeline).

**Gate 0 ✅** — `docker compose up` serves `/healthz` with the git SHA; CI is green on a PR; a dummy migration runs in CI against an ephemeral replica set.

**Skills story:** monorepo discipline, CI, config validation — the stuff seniors get asked about.

---

## Phase 1 — Auth & Tenancy (Week 2) · "Who are you"

**Tasks**

1. Better Auth mounted in NestJS (`/api/auth/*`), MongoDB adapter, email/password.
2. `AuthGuard` + `@CurrentUser()` decorator; session cookie config (httpOnly/secure/strict).
3. `user_profiles` module; repository base class that **requires** `userId` in every method signature.
4. Signup → create profile in one transaction; then `disableSignUp` after your account exists.
5. Rate limiting on auth routes (Redis-backed throttler).
6. Next.js: login page via Better Auth client SDK, session-aware layout, cookie forwarding in server components.
7. Cross-tenant probe test harness (two seeded users; suite asserts 404/403 on every cross-access — grows with every future endpoint).

**Gate 1 ✅** — Login from the browser; hitting any API route without a session → 401; cross-tenant suite green; 11th login attempt in a minute → 429.

---

## Phase 2 — Ledger Core (Weeks 3–4) · "Money moves, atomically"

The heart. Everything else decorates this.

**Tasks**

1. `withTxn` helper + tests proving rollback (induced failure mid-transaction leaves zero partial writes).
2. Money utils (`paise ↔ display`, parsing "1,250.50" and "1250.5") — property-based tests (fast-check).
3. `accounts`, `categories` modules (CRUD, archive-not-delete).
4. `transactions` module: create (expense/income) = insert + balance `$inc` + audit, one transaction.
5. Idempotency interceptor: `Idempotency-Key` header → unique index → duplicate returns original result, 200.
6. Reversal service: compensating entry + status flip + linkage, status guards (can't reverse a reversal, can't double-reverse).
7. Transfer service: two legs + `transferGroupId`, atomic; group-level revert only.
8. Non-monetary PATCH (description/tags/category) with audit before/after snapshot.
9. Cursor pagination + filters on `GET /v1/transactions`; migration `002` with all §2.1 indexes.
10. Next.js: transaction list + quick-add form (mobile-first — this is the Metro screen; idempotency UUID generated on mount).

**Gate 2 ✅** — On your phone: add chai ₹20 → balance moves → undo → balance restores → both entries visible in history with linkage. Double-tap the submit button on throttled 3G devtools → exactly one transaction. Kill the API mid-request in a chaos test → no partial writes.

**Skills story:** ACID in Mongo, ledger/compensating-entry pattern, idempotency — direct NBFC-domain overlap with Godrej.

---

## Phase 3 — CSV Import Pipeline (Weeks 5–6) · "Statements in, revertible"

**Tasks**

1. Redis + BullMQ wiring, worker process, Bull Board behind auth, DLQ + GlitchTip alert on exhausted retries.
2. Upload endpoint: multipart, 5 MB cap, MIME/extension/row-count guards, `fileHash` rejection of re-uploads.
3. Streaming parser job (`csv-parse`): normalize dates (explicit format), amounts (both single-signed and debit/credit-column conventions), compute `dedupeHash`, write `staged_rows`, flag dupes + problems.
4. Column-mapping persistence per account; ship HDFC + ICICI presets.
5. Preview API + UI: staged rows, dupe/problem badges, untick rows, fix suggested category.
6. Commit: 200-row chunked transactions, net balance `$inc` per chunk, **resumable** (re-run skips landed dedupeHashes), batch status transitions.
7. Batch revert: bulk compensating entries, chunked, status → `reverted`.
8. Rule-based category suggester (`SWIGGY→Food`, `IRCTC→Travel`, user-editable rules collection) — behind an interface so the future embedding classifier is a drop-in.
9. TTL index on `staged_rows` (migration `003`).
10. CSV export endpoint with formula-injection neutralization.

**Gate 3 ✅** — Import a real HDFC statement end-to-end; kill the worker mid-commit and re-run → row count exact, no dupes; revert the whole batch → balance identical to pre-import to the paisa; re-import → clean.

---

## Phase 4 — Automation & Ops (Week 7) · "It runs itself"

**Tasks**

1. `@nestjs/schedule` triggers → BullMQ jobs for all §6 crons.
2. `recurring_rules` module + rrule materializer (idempotency key = `ruleId+date`).
3. `monthly_rollups` aggregation pipeline + refresh job; dashboard switched to read rollups.
4. Sunday `balances.verify` job + drift gauge metric + GlitchTip alert on non-zero.
5. Budgets module + threshold alerts via **outbox pattern** → ntfy/Telegram adapter with circuit breaker.
6. Backup cron: mongodump → NAS (30d/12m retention) + weekly rclone offsite; **do one restore drill now**, document the runbook.
7. Graceful shutdown wired and chaos-tested (SIGTERM during job + during request).
8. Staging LXC deployed from CI; prod deploy job with manual approval + smoke test + documented rollback.

**Gate 4 ✅** — Rent posts itself on the 1st exactly once (verified by forcing a double cron fire); phone pings at 80% food budget; you have personally restored a dump to `vyaya-drill` and the verify job passed on it.

---

## Phase 5 — Reports, Observability, Polish (Week 8) · "Fast and visible"

**Tasks**

1. Reports: monthly summary, cashflow range, category drill-down; Redis read cache with write-time busting.
2. OpenTelemetry auto-instrumentation → Grafana LGTM LXC; `/metrics` Prometheus endpoint; dashboards for RED + queue depth + drift gauge.
3. k6 load suite: 200 writes/sec sustained 5 min, import of 5k rows — record p95s against SLOs, fix the worst offender.
4. `explain()` query-budget test in CI (fail on COLLSCAN in hot paths).
5. Passkeys plugin (Face ID login), 2FA optional.
6. Monthly summary push (outbox) — top categories, MoM delta, biggest transactions.
7. OpenAPI spec published; typed client generated for Next.js; `oasdiff` breaking-change check in CI.

**Gate 5 ✅** — Face-ID login on the iPhone; Grafana shows a full trace upload→job→commit for one request id; k6 report committed to the repo with SLOs met.

---

## Phase 6 — GenAI Layer (Weeks 9–12, relaxed pace) · "The portfolio multiplier"

**Tasks**

1. Embedding-based transaction categorizer replacing the rule engine behind the same interface (local model via Ollama on the homelab, or API): backfill-classify history, measure accuracy vs your manual labels, keep human-in-the-loop confirm in import preview.
2. `/v1/reports/ask`: natural-language questions over rollups + transactions (LangChain.js/LangGraph.js, tool-calling over your own aggregation functions — _not_ raw text-to-Mongo-query).
3. Eval harness: 30 golden Q&A pairs about your own data; regression-test the agent like any other module.
4. Write it up: architecture README diagrams + a short "what I'd do differently" — this is the interview artifact for Feb 2027.

**Gate 6 ✅** — "How much did commute cost vs last quarter?" answered correctly from your phone; categorizer beats the rule engine on your labeled set; eval suite in CI.

---

## Sequencing Rules & Risk Notes

- **Cut-line discipline:** if a week slips, cut scope _within_ the phase, never the gate. Gates are the product.
- **Highest-risk items, do first within their phase:** `withTxn` rollback proof (P2.1), resumable commit (P3.6), double-fire cron proof (P4 gate). Everything else is typing.
- **Deliberate deferrals:** multi-currency, shared/household accounts, receipt-photo OCR, mobile app — all have designed seams (currency field, userId discipline, source enum) and zero code.
- **Timeline honesty:** 8 weeks of core + 4 relaxed GenAI weeks lands the full system around late September 2026 — comfortably ahead of the February 2027 interview window, with the GenAI layer fresh enough to demo live.
