# Vyaya — Backend Logging & Debugging Architecture

> Consolidates the logging decisions scattered across `BACKEND.md` (§16) into one authoritative doc, and upgrades them from "we have logs" to "any bug is traceable in under 5 minutes." Stack: **pino → stdout → Docker → Loki (Grafana LGTM LXC), GlitchTip for errors, OTel for traces, `audit_log` in Mongo for money history.**
>
> **Prime directive:** every log line answers _who, what, which request, which money_. A log line you can't correlate is noise.

---

## 1. The Three Planes (don't mix them)

| Plane                            | Store     | Retention | Purpose                                                                                                  |
| -------------------------------- | --------- | --------- | -------------------------------------------------------------------------------------------------------- |
| **Logs** (pino → Loki)           | Loki      | 30 days   | Debugging: what the code did                                                                             |
| **Errors** (GlitchTip)           | GlitchTip | 90 days   | Alerting: what the code did _wrong_, deduplicated, with stack traces                                     |
| **Audit** (`audit_log` in Mongo) | Mongo     | Forever   | Business history: what happened to money. **Not logging** — it's data, written in-transaction, immutable |

Rule: money events go to audit (in-transaction) _and_ get a log line (best-effort). Never rely on Loki for money questions; never put debugging chatter in audit.

---

## 2. Correlation — the whole game

Every log line carries a **context object**, bound once, propagated everywhere:

```ts
{
  reqId:   string,   // x-request-id: accepted from client or generated at nginx/API edge
  userId?: string,   // from session (never from body)
  jobId?:  string,   // BullMQ job id when in a worker
  jobName?: string,
  batchId?: string,  // import batch, when relevant
  txnId?:  string,   // ledger transaction, when relevant
  traceId?: string,  // OTel trace id — links logs ↔ traces in Grafana
}
```

**Propagation rules (this is the architecture):**

1. **HTTP:** `pino-http` + `AsyncLocalStorage` (NestJS CLS). Middleware creates the context; every `this.logger` call anywhere in the request automatically inherits `reqId`/`userId`/`traceId`. No manual threading, no logger params in function signatures.
2. **Into queues:** when a service enqueues a BullMQ job, it copies `{reqId, userId}` into `job.data.ctx`. The worker's processor opens a new ALS scope from it. Result: the CSV upload's `reqId` appears on the parse job's logs _and_ on the commit logs — one `{reqId="abc"}` Loki query shows the entire import lifecycle across two processes.
3. **Cron-originated work** has no request; the scheduler mints `reqId = cron:<jobName>:<IST-date>` — deterministic, so "what did the salary run do on July 1" is a one-line query you can guess without looking anything up.
4. **Into Mongo:** `withTxn` stamps `reqId` on every `audit_log` entry. Audit ↔ logs ↔ traces all join on the same id.
5. **Back to the client:** every response returns `x-request-id`. The frontend attaches it to GlitchTip events (see frontend doc), so a user-visible error links straight to the exact backend Loki query.

---

## 3. Logger Setup

```ts
// common/logging/logger.ts
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info", // debug in staging, info in prod
  base: {
    service: process.env.SERVICE_ROLE, // 'api' | 'worker'
    sha: process.env.GIT_SHA
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.password",
      "*.secret",
      "*.token",
      "*.mongoUri",
      "req.body.password"
    ],
    censor: "[REDACTED]"
  },
  formatters: { level: (label) => ({ level: label }) } // "level":"info" not 30
});
// NO pino-pretty in containers — JSON to stdout, always. Pretty only via `pnpm dev`.
```

- **Child loggers per module:** `this.logger = logger.child({ mod: 'imports' })` via a Nest `LoggerService` wrapper. `{mod="imports"}` becomes a Loki label.
- **Redaction is structural, not hopeful:** pino redact paths + a lint rule banning `logger.*(...JSON.stringify(req))`. Amounts and descriptions are _allowed_ (it's your own data on your own Grafana — hiding them would cripple debugging), secrets are not, ever.
- **Loki labels kept low-cardinality:** `service`, `mod`, `level`, `sha`. `reqId`/`userId`/`jobId` stay in the JSON body (queried with LogQL `| json | reqId="..."`), never as labels — high-cardinality labels kill Loki.

## 4. Level Policy (enforced in review, not vibes)

| Level   | Meaning                                     | Examples                                                                                                       |
| ------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `fatal` | Process cannot continue                     | env validation failed, Mongo unreachable at boot                                                               |
| `error` | An operation failed and someone should look | txn commit failed after retries, DLQ arrival, outbox delivery exhausted, **balance drift detected**            |
| `warn`  | Survivable oddity, watch for patterns       | txn retry (transient), idempotency dedupe hit, salary variance outside tolerance, circuit breaker opened, 429s |
| `info`  | Business-relevant events, one line each     | request summary line, `txn.created`, `import.committed`, `salary.materialized`, job start/finish with duration |
| `debug` | Developer forensics, off in prod by default | chunk boundaries, dedupe hash inputs, payday calc intermediates, Mongo command durations                       |
| `trace` | Never committed                             | —                                                                                                              |

**Canonical event convention:** business events log with a stable `event` field, machine-greppable and versionable:

```ts
log.info({ event: "txn.created", txnId, accountId, amountMinor, type }, "transaction created");
log.info({ event: "import.commit.chunk", batchId, chunk: 3, of: 5, rows: 200, ms: 412 });
log.warn({ event: "idem.duplicate", key, originalTxnId }, "idempotent replay served");
log.error({ event: "balance.drift", accountId, cachedMinor, computedMinor, driftMinor });
```

The `event` vocabulary lives in `common/logging/events.ts` as a const union — a typo'd event name is a type error. Dashboards and alerts key off `event`, so renames are a reviewed change.

## 5. What Gets Logged Where (lifecycle coverage)

**HTTP requests — one summary line each** (pino-http): method, path (route pattern, not raw URL — cardinality), status, duration, reqId, userId. Bodies logged only at `debug`, only in staging, post-redaction. Health checks (`/healthz`, `/readyz`) filtered out entirely — they're 90% of noise otherwise.

**`withTxn`:** `debug` on start; `warn` per transient retry **with attempt number** (a retry storm shows up as a warn-rate spike, which is alertable); `error` with full context on final failure. Duration on every commit at `debug`, and auto-promoted to `warn` if > 500ms — slow transactions are the leading indicator of lock/size problems.

**BullMQ (worker):** `info` job start/finish `{event:'job.done', jobName, jobId, ms, attempts}`; `warn` each retry with the error summary; `error` + GlitchTip on DLQ arrival. Queue depth is a _metric_, not a log.

**Crons:** each run logs a single structured summary — `{event:'cron.salary.materialize', posted: 1, skipped: 0, ms: 84}` — under its deterministic `reqId`. A cron that logs nothing didn't run: an absence-based Grafana alert catches a dead scheduler (see §7).

**Mongo:** driver `commandSucceeded` monitor at `debug` with collection+duration (no full queries — they contain user data and are huge); anything > 100ms auto-promotes to `warn {event:'mongo.slow'}` with the collection and the _shape_ (redacted filter keys, not values).

**Better Auth:** login success/failure (`warn` on failure with IP — throttle tuning), session revocations, passkey registrations. Never log credentials or session token contents; log the session id _hash_ for correlation.

**Outbox/notifications:** `info` on delivery, `warn` per retry, `error` on exhaustion, `warn {event:'breaker.open', target:'ntfy'}` on circuit state change.

## 6. Errors: pino vs GlitchTip division of labor

- **pino `error`** = the operational record (what/where/context). **GlitchTip** = triage: deduplication, stack traces, release (git SHA) tagging, "first seen in", alert routing.
- The global Nest exception filter reports **only unexpected errors** (non-`AppError`, or `AppError` marked severe) to GlitchTip — expected domain errors (validation 422s, idempotency conflicts) are `info`/`warn` logs, never GlitchTip events. Alert fatigue is a real failure mode on a solo project: if GlitchTip pings you, it must always be worth reading.
- Every GlitchTip event carries `reqId` as a tag → the Loki query `| json | reqId="X"` is one click away from a GlitchTip issue (paste the query as a GlitchTip issue link template).

## 7. Debugging Playbooks (in-repo `docs/debugging.md`, seeded with these)

1. **"A request misbehaved":** get `x-request-id` from the response/GlitchTip → Grafana Loki `{service=~"api|worker"} | json | reqId="X"` → full cross-process story → click `traceId` → Tempo span waterfall for the timing.
2. **"Import did something weird":** `| json | batchId="Y"` → upload summary, parse job per-chunk lines, dedupe warns, commit chunks, or the DLQ error. Resumability means the fix is usually "re-run commit" — the logs tell you which chunk died.
3. **"Balance looks wrong":** don't read logs first — run the verify job (`pnpm job:verify`). If drift: the `event:'balance.drift'` error has the account; then audit_log for that account (permanent, in-transaction, trustworthy) diffed against transactions. Loki is corroboration, audit is truth.
4. **"Salary didn't post":** `reqId="cron:salary.materialize:2026-08-01"` — deterministic, no searching. Either the summary line shows `skipped` with a reason field, or the absence alert already fired.
5. **"It's slow":** Tempo trace for one slow `reqId` → if Mongo spans dominate, check `event:'mongo.slow'` frequency by collection → `explain()` locally.

**Log-derived alerts (Grafana, few and unmissable):** any `event:'balance.drift'` (instant), DLQ arrival, `fatal` anywhere, cron summary line **absent** for 26h, `withTxn` retry-warn rate > 2% of writes over 15m, breaker open > 10m.

## 8. Environment Matrix & Hygiene

|               | dev (laptop)       | staging              | prod                                                        |
| ------------- | ------------------ | -------------------- | ----------------------------------------------------------- |
| Level         | debug, pino-pretty | debug                | info                                                        |
| Bodies        | yes (redacted)     | debug-only           | never                                                       |
| GlitchTip     | off                | on (staging env tag) | on                                                          |
| OTel sampling | 100%               | 100%                 | 100% (single-user volume; revisit if ever >1 rps sustained) |

- `console.log` is banned by ESLint in `apps/api` — everything goes through the logger (AGENTS.md §7 already says this; here's why: console lines have no context object, so they're invisible to every playbook above).
- Log volume budget: at info level this system should produce ~2–4 lines per request and ~5–20 per job. If a module chats more, its lines belong at debug. Review checklist item.
- Docker: `json-file` driver with `max-size: 10m, max-file: 3` on every service (belt) + Promtail/Alloy shipping to Loki (suspenders) — a Loki outage never fills the LXC disk.
