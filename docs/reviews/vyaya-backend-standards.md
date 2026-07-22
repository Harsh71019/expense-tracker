# TreasuryOps Backend Standards — NestJS · MongoDB Atlas · Redis (2026)

> Scope: the NestJS API, MongoDB data layer, Redis (cache + queues), background jobs, observability, security, and deployment on the Proxmox homelab. Frontend has its own doc.

---

## 1. NestJS Architecture Conventions

### 1.1 Module layout — feature modules, thin controllers, fat services

```
apps/api/src/
├── main.ts                      # bootstrap: pino, helmet, shutdown hooks, swagger
├── app.module.ts
├── config/                      # typed, Zod-validated configuration
├── common/
│   ├── filters/                 # global exception filter → Problem Details
│   ├── interceptors/            # logging context, serialization
│   ├── guards/                  # JwtAuthGuard (global), roles
│   ├── decorators/              # @CurrentUser(), @Public()
│   └── domain/                  # Money value object, DateBucket helpers
├── modules/
│   ├── auth/
│   ├── users/
│   ├── transactions/
│   │   ├── transactions.module.ts
│   │   ├── transactions.controller.ts   # HTTP mapping ONLY
│   │   ├── transactions.service.ts      # business rules
│   │   ├── transactions.repository.ts   # ALL Mongoose access
│   │   ├── schemas/transaction.schema.ts
│   │   └── dto/                          # nestjs-zod DTOs from shared schemas
│   ├── budgets/
│   ├── categories/
│   ├── recurring/               # rrule expansion + BullMQ scheduling
│   ├── reports/                 # aggregation pipelines live here
│   └── import/                  # CSV/statement ingestion (queued)
├── infra/
│   ├── database/                # Mongoose connection module
│   ├── redis/                   # ioredis provider (shared by cache + BullMQ)
│   └── queue/                   # BullMQ registration
└── health/                      # @nestjs/terminus
```

**Rules:**

* **Controllers do zero logic** — parse (via pipe), delegate, map. If a controller has an `if`, it probably belongs in the service.
* **Repository pattern over raw Model injection in services.** Services depend on `TransactionsRepository`, not `Model<Transaction>`. Mongoose stays swappable/mockable, and every query gains one audited home. This also makes the unit-test story trivial: mock the repository provider in `Test.createTestingModule`, never the DB.
* **No cross-feature service imports.** `budgets` must not inject `TransactionsService`. Cross-domain reads go through a small exported query interface or events. `madge --circular` in CI enforces it — circular module deps in Nest manifest as `undefined` injection tokens *at runtime*, one of the nastiest bug classes in the framework.
* **Fastify adapter** (`@nestjs/platform-fastify`) over Express: meaningfully higher throughput, and nothing in TreasuryOps needs Express-specific middleware. Decide day one — switching later touches every custom middleware.

### 1.2 Configuration — fail fast, fully typed

Environment validation with Zod at boot (via `@nestjs/config` custom `validate`, or `nestjs-zod`). An API that boots with a missing `MONGODB_URI` and dies an hour later under load is worse than one that refuses to start:

```ts
// config/env.schema.ts
export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  PORT: z.coerce.number().default(3001),
  MONGODB_URI: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
});
export type Env = z.infer<typeof EnvSchema>;
```

Inject a typed `ConfigService<Env, true>` everywhere; never `process.env` outside this module.

### 1.3 Validation — Zod end to end via `nestjs-zod`

class-validator is the Nest default, but it means maintaining decorator DTOs *in parallel with* the Zod schemas the frontend already uses — guaranteed drift. **`nestjs-zod`** solves this: one Zod schema is the validation pipe input, the TS type, and the OpenAPI schema. (NestJS v12's planned native Standard Schema support will make this even more first-class; nestjs-zod is the bridge today.)

```ts
// dto/create-transaction.dto.ts
import { createZodDto } from "nestjs-zod";
import { CreateTransactionSchema } from "@treasury-ops/shared"; // same schema the web app imports

export class CreateTransactionDto extends createZodDto(CreateTransactionSchema) {}
```

Register `ZodValidationPipe` as a global `APP_PIPE`, `ZodSerializerInterceptor` for response shaping, and the zod exception filter for clean 400s. **Every boundary parses:** HTTP bodies/queries/params, queue job payloads, and — often forgotten — *documents read from Mongo* on critical paths (schema drift in a document DB is real).

---

## 2. MongoDB Layer (Mongoose on Atlas)

### 2.1 Schema design for an expense tracker

```ts
@Schema({ collection: "transactions", timestamps: true })
export class Transaction {
  @Prop({ type: String, required: true }) _id: string;        // ULID
  @Prop({ type: String, required: true, index: true }) userId: string;
  @Prop({ type: Number, required: true }) amountMinor: number; // integer paise. NEVER Decimal128-of-floats, never Number-of-rupees
  @Prop({ type: String, required: true, enum: ["INR"] }) currency: string;
  @Prop({ type: String, required: true, enum: ["expense", "income"] }) kind: string;
  @Prop({ type: String, required: true }) txnDate: string;     // "2026-07-19" — calendar date in user TZ
  @Prop({ type: String, required: true, index: true }) categoryId: string;
  @Prop({ type: String, maxlength: 200 }) note?: string;
  @Prop({ type: [String], default: [] }) tags: string[];
  @Prop({ type: String }) recurringId?: string;                // provenance if spawned by a rule
  @Prop({ type: Date }) deletedAt?: Date;                      // soft delete for undo
}
```

**Modelling decisions & rationale:**

* **Amount = integer minor units.** All arithmetic in the service layer through a `Money` value object (dinero.js or a thin custom class). MongoDB's `Decimal128` exists, but integer paise is simpler, faster to index/aggregate, and impossible to get wrong with `$sum`.
* **`txnDate` as a calendar-date string** (plus `createdAt` UTC instant from timestamps). All monthly/weekly bucketing uses `txnDate` — string prefix matching (`^2026-07`) or `$substrBytes` in pipelines. This eliminates the timezone-boundary bug class entirely and makes month queries index-friendly.
* **Reference categories, embed nothing volatile.** Categories are their own collection (user-customizable); transactions store `categoryId`. Denormalize only truly immutable display data if profiling demands it.
* **Soft delete** (`deletedAt`) to power "Undo" after delete; a nightly BullMQ job hard-purges after 30 days.
* **ULIDs as `_id`** — time-sortable, so `_id` doubles as a stable cursor for pagination.

**Indexes — declared in the schema, verified in CI:**

```ts
TransactionSchema.index({ userId: 1, txnDate: -1, _id: -1 }); // the workhorse: month lists + cursor pagination
TransactionSchema.index({ userId: 1, categoryId: 1, txnDate: -1 }); // category drill-down
TransactionSchema.index({ userId: 1, deletedAt: 1 }, { sparse: true });
```

Every list query must be covered; run `.explain()` on the report pipelines once real data volume exists. Atlas Performance Advisor will nag you anyway — beat it to it.

### 2.2 Query discipline

* **`.lean()` on every read** that doesn't need document methods (i.e., nearly all of them). Hydrating full Mongoose documents for a 500-row list is pure waste.
* **Aggregation pipelines live in `reports/` only**, each as a named, unit-tested function. Monthly summary, category breakdown, and trend endpoints return **pre-computed minor-unit totals** — the frontend never aggregates.
* **Cursor pagination, not offset.** `{ txnDate: { $lte }, _id: { $lt: cursor } }` with the compound index — stable under concurrent inserts, O(1) regardless of page depth.
* **Transactions (the ACID kind):** Atlas replica sets support multi-document transactions — use them for the few genuinely multi-write invariants (transfer between accounts = paired debit/credit; import batch commit). Everything else is single-document and atomic already; don't wrap everything in sessions.
* **Projection always** — never return full documents to the API layer if the DTO uses five fields.

---

## 3. Redis — Cache and Queues (one instance, two roles)

Single Redis (homelab) with **separate logical DBs or key prefixes**: `cache:*` and BullMQ's own `bull:*` namespaces. One `ioredis` connection provider in `infra/redis`, injected everywhere — never construct clients ad hoc.

### 3.1 Caching (`@nestjs/cache-manager` + Keyv Redis store)

Cache the **expensive, read-heavy, computed** things — not raw lists:

| Key pattern | TTL | Invalidation |
|---|---|---|
| `cache:report:{userId}:{month}` | 1h | On any txn write in that month → explicit `del` |
| `cache:categories:{userId}` | 24h | On category CRUD |
| `cache:dashboard:{userId}` | 15m | On txn/budget write |

**Rules:** write-through invalidation from the service layer (the repository emits, the service invalidates — one place); cache values are JSON of the *DTO shape*, minor units intact; a cache miss must never be an error path. Never cache anything auth-derived under a shared key.

### 3.2 BullMQ (`@nestjs/bullmq`) — everything slower than ~200ms leaves the request cycle

Queues for TreasuryOps:

* **`recurring`** — a repeatable "tick" job (daily 00:05 IST) expands active `rrule`s and materializes due transactions. Job ID = `recurring:{ruleId}:{date}` → natural idempotency; re-running a day is a no-op.
* **`import`** — CSV/statement parsing: upload returns `202 + jobId` immediately; the worker streams papaparse, validates rows with Zod, batches inserts, reports progress; the frontend polls or listens on a progress endpoint.
* **`ai-categorize`** — the SAKSHAM-adjacent showcase: enqueue uncategorized txns, worker calls the LLM to suggest categories, writes suggestions (never auto-commits money-affecting changes).
* **`maintenance`** — soft-delete purge, cache warmup, backup ping.

**Worker discipline:** every job payload Zod-parsed on consume; retries with exponential backoff (`attempts: 3+`); failed jobs land in a dead-letter pattern and page you via the observability stack rather than vanishing; `removeOnComplete: { age: 86400 }` so Redis doesn't bloat. Add **bull-board** (self-hosted UI, behind Cloudflare Access) for queue visibility — fits the homelab dashboard aesthetic and demos well.

BullMQ 5 ships OpenTelemetry support (`bullmq-otel`) — wire it in so a trace spans *HTTP request → enqueue → worker → Mongo write*.

---

## 4. Observability

### 4.1 Structured logging — `nestjs-pino`

`console.log` is banned; Nest's default logger is dev-only. **Pino** via `nestjs-pino`: JSON logs, automatic per-request context (request ID, route, latency), trace-ID injection when OTel is active, and redaction:

```ts
LoggerModule.forRoot({
  pinoHttp: {
    redact: ["req.headers.authorization", "req.headers.cookie", "*.password"],
    customProps: (req) => ({ userId: req.user?.id }),
    transport: process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty" }
      : undefined,
  },
});
```

Log **events, not prose**: `{ event: "txn.created", txnId, amountMinor, categoryId }`. Never log full request bodies on money endpoints.

### 4.2 Tracing & metrics — OpenTelemetry

`@opentelemetry/sdk-node` + `auto-instrumentations-node`, initialized *before* Nest bootstraps (separate `instrumentation.ts` required first). Auto-instrumentation covers HTTP, Mongoose/MongoDB, ioredis (which also captures BullMQ's Redis traffic), and outbound fetch. Add custom spans only around business-critical sections: report aggregation, import batches, AI categorization calls.

Export OTLP to the homelab stack (Grafana + Tempo + Loki, or SigNoz as an all-in-one — SigNoz is the lower-effort choice for a single-node Proxmox setup). Errors → self-hosted **GlitchTip** (Sentry-compatible SDK, lighter to run).

### 4.3 Health — `@nestjs/terminus`

`/health/live` (process up) and `/health/ready` (Mongo ping + Redis ping + memory heap check). Uptime Kuma on the homelab polls `ready`; Docker healthcheck uses `live`.

---

## 5. Security Baseline

| Layer | Standard |
|---|---|
| Headers | `@fastify/helmet` |
| Rate limiting | `@nestjs/throttler` (Redis storage so limits survive restarts); strict bucket on `/auth/*` (e.g., 5/min), generous on reads |
| Auth | Short-lived JWT access (15m) + rotating refresh tokens; refresh tokens **hashed** in DB with family-reuse detection (reused refresh token → revoke the whole family) |
| Password hashing | **argon2id** (`argon2`) — not bcrypt in 2026 |
| CORS | Explicit allowlist (`app.harshgoddev.xyz`), credentials on, no wildcards |
| Input | Global ZodValidationPipe = nothing unparsed enters a service. NoSQL injection dies here too: Zod rejects objects where strings are expected, killing `{"$gt": ""}` operator injection |
| Authorization | Every repository method takes `userId` as a **required first parameter** — ownership scoping is structural, not remembered. No query without a user scope exists |
| Secrets | Env-only, validated at boot; Vaultwarden holds the originals; never in git (add `gitleaks` to CI to enforce) |
| Sensitive ops | Audit log collection for auth events + destructive actions (append-only) |

---

## 6. API Design Standards

* **Versioned URI**: `/api/v1/...` via Nest's `enableVersioning` — free insurance for the future mobile client.
* **Errors: RFC 9457 Problem Details** (`application/problem+json`) from one global exception filter. Every error has `type`, `title`, `status`, `detail`, `instance` + a correlation ID matching the pino log line. Frontend gets one error shape to handle, forever.
* **Response envelope**: `{ data, meta }` where `meta` carries `nextCursor`, counts. Consistent across every list endpoint.
* **Idempotency**: mutation endpoints accept an `Idempotency-Key` header (stored in Redis, 24h TTL) — double-tap on mobile must not create two expenses. This is *the* fintech-signal feature reviewers notice.
* **OpenAPI**: `@nestjs/swagger` + nestjs-zod's `cleanupOpenApiDoc` — docs generated from the same Zod schemas, served at `/api/docs` behind auth in prod. Optionally generate the typed frontend client from this spec (`openapi-typescript`) instead of hand-writing `api.ts`.

---

## 7. Backend Testing

| Layer | Tooling | What |
|---|---|---|
| Unit | Vitest (Nest supports SWC/Vitest tooling now — faster than Jest on decorator-heavy code) + `Test.createTestingModule` with mocked repositories | Services: business rules, Money math, rrule expansion, budget threshold logic |
| Property-based | `fast-check` | Money invariants: split sums equal original; report totals equal txn sums — across thousands of generated cases |
| Repository/integration | **`mongodb-memory-server`** (fast, in-process) or **Testcontainers** (real Mongo + Redis, closer to prod — prefer for the aggregation pipelines since memory-server lags Atlas features) | Queries, indexes actually used (`explain` assertions on the workhorse queries), aggregation correctness |
| Queue | BullMQ against Testcontainers Redis | Idempotent job IDs, retry behavior, dead-letter routing |
| E2E | Nest app + `supertest`(or light `fetch`) against Testcontainers | Auth flow, txn CRUD with ownership checks (user A cannot read user B — **test this explicitly**), Problem Details shape, idempotency-key replay |

CI order: lint → typecheck → unit (parallel) → integration (Testcontainers) → e2e → build. Integration tests get a `testcontainers` service step; keep them under ~2 min or they'll get skipped culturally.

---

## 8. Deployment on the Homelab (CT102 / Dokploy)

* **Multi-stage Dockerfile**: deps → build (SWC) → prune prod deps → distroless/`node:22-slim` runtime, non-root user, `NODE_ENV=production`. Target < 200MB.
* **Graceful shutdown is not optional with queues**: `app.enableShutdownHooks()`; on SIGTERM close the HTTP server, then `worker.close()` (lets in-flight jobs finish), then Mongo/Redis disconnect. Dokploy/Docker sends SIGTERM on redeploy — without this, an import job dies mid-batch.
* **Process topology**: run the API and the BullMQ workers as **separate containers from the same image** (`CMD` switch: `api` vs `worker`). A heavy import must never steal event-loop time from HTTP requests. On one homelab node this costs nothing and is the architecturally correct story to tell.
* **Config**: env via Dokploy secrets; Atlas connection string with `retryWrites=true&w=majority`; Redis on the internal Docker network only — never exposed through the tunnel.
* **Backups**: Atlas handles Mongo (verify the free-tier snapshot policy); Redis is rebuildable state (cache + queues) — document that explicitly so future-you doesn't panic.
* **Edge**: Cloudflare Tunnel → NPMplus → API container; Cloudflare Access in front of bull-board, Swagger, and any admin surface.

---

## 9. Backend PR Checklist (append for `api` scope)

- [ ] New endpoint: nestjs-zod DTO from shared schema, versioned route, Problem Details on failure
- [ ] Repository method takes `userId` scope; no unscoped query introduced
- [ ] Money handled via value object in minor units; any new invariant has a property-based test
- [ ] Reads use `.lean()` + projection; new list query covered by an index (explain-checked)
- [ ] Anything > ~200ms moved to BullMQ; job ID idempotent; payload Zod-parsed in worker
- [ ] Cache invalidation added for any write touching cached reports
- [ ] Logs are structured events; no secrets/PII/full bodies logged
- [ ] Ownership test exists: another user's ID cannot access the resource
