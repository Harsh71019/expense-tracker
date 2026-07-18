# Vyaya — Frontend Logging & Debugging Architecture

> Companion to `LOGGING-BACKEND.md`. The browser is not a log platform — the frontend's job is to (1) report real errors with enough context to reproduce, (2) carry the correlation id that links a user-visible failure to the exact backend logs, and (3) stay silent otherwise. Stack: **GlitchTip browser SDK (Sentry-compatible) + a tiny internal `debug` logger + web-vitals beacon.**

---

## 1. What the Frontend Logs (and pointedly doesn't)

| Signal                                                         | Destination                         | Notes                                                        |
| -------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------ |
| Unhandled errors, boundary catches, failed mutations           | GlitchTip                           | deduplicated, source-mapped, tagged with `reqId`             |
| Breadcrumbs (route changes, key user actions, network results) | GlitchTip (attached to events only) | ring buffer in memory; uploaded **only** when an error fires |
| Web vitals (LCP/INP/CLS)                                       | `POST /api/v1/vitals` → Prometheus  | sampled beacon, no third party                               |
| Dev-time debugging                                             | `lib/debug.ts` logger               | compiled out of prod bundles                                 |
| Everything else                                                | nowhere                             | no analytics, no session replay, no console noise in prod    |

There is deliberately **no general log shipping from the browser**: at single-user scale it's cost without benefit, and the backend summary line already records every request the client makes. GlitchTip breadcrumbs give you the client-side story exactly when it matters — attached to an actual error.

---

## 2. Correlation (the contract with the backend)

1. **Outbound:** `lib/api/client.ts` generates `x-request-id` (`crypto.randomUUID()`) per request and sends it. The backend adopts it — so the id in a failed fetch is the id in Loki.
2. **On failure:** the API wrapper attaches `{reqId, method, route, status, problemType}` to the thrown `AppError`, records a breadcrumb, and the GlitchTip event handler copies `reqId` into event **tags** — searchable, and one paste away from the Loki query.
3. **Visible to you:** error boundary fallback UIs render the short reqId ("Something went wrong · ref `a1b2c3`"). When future-you hits a bug on the train, the screenshot alone is enough to debug that night. Copy-on-tap.
4. **Offline queue entries** keep their idempotency key as the correlation handle — a sync failure logs `{idemKey}`, and that same key is on the backend's dedupe/insert lines.

## 3. GlitchTip Setup

```ts
// instrumentation-client.ts
Sentry.init({
  dsn: env.NEXT_PUBLIC_GLITCHTIP_DSN,
  release: env.NEXT_PUBLIC_GIT_SHA, // same SHA the API reports on /healthz
  environment: env.NEXT_PUBLIC_ENV, // staging | prod
  sampleRate: 1.0, // errors: all of them (single user)
  tracesSampleRate: 0, // perf tracing stays a backend concern (Tempo)
  maxBreadcrumbs: 50,
  beforeBreadcrumb: scrubBreadcrumb, // §4
  beforeSend: scrubEvent, // §4
  ignoreErrors: [
    "AbortError",
    "Load failed", // navigation/HMR noise
    /Failed to fetch/, // raw network flap — we report our typed NetworkError instead, once, with context
    "ResizeObserver loop"
  ]
});
```

- **Source maps uploaded in CI** (`sentry-cli` works against GlitchTip) during the web image build, keyed by the git SHA — a minified stack trace without source maps is a haiku, not a report.
- **Server-side too:** `instrumentation.ts` registers the Node SDK for RSC/route-handler errors in the `web` container — Next.js server errors are frontend-owned and must not vanish between the two GlitchTip projects (`vyaya-web`, `vyaya-api`).
- **Noise policy mirrors the backend:** expected domain outcomes (validation 422 rendered on a form field, idempotent replay, offline-queue "will sync later") are **never** GlitchTip events. If it has UI, it's not an error report. A 401 redirect is a breadcrumb, not an event.

## 4. Breadcrumbs & Scrubbing (debuggable ≠ leaky)

**Recorded breadcrumbs:** route changes, mutation attempts/outcomes (`txn.create → 201 (142ms) reqId=…`), query cache invalidations (dev only), offline queue transitions (`queued/drained/conflict`), auth state changes, import step progression.

**Scrubbing (`scrubEvent`/`scrubBreadcrumb`):** even on a self-hosted GlitchTip, error payloads shouldn't carry ledger contents — events leave the app's trust boundary (screenshots, shared issues):

- Replace `amountMinor` values and `description` strings in breadcrumb/request data with `⟨minor⟩`/`⟨text⟩` — the _shape and status_ is what debugging needs; the reqId recovers exact values from backend logs if truly required.
- Never attach form state, cookies, or the offline queue payloads. URLs are fine (they carry filters, not amounts).
- One `Sentry.setUser({ id })` with the user id only — no email/name.

## 5. The Dev Logger (`lib/debug.ts`)

```ts
const enabled =
  process.env.NODE_ENV !== "production" ||
  (typeof window !== "undefined" && localStorage.getItem("vyaya:debug") === "1");

export const debug = {
  api: mk("api"), // request/response summaries
  query: mk("query"), // TanStack cache events
  offline: mk("offline"), // queue ops
  form: mk("form") // validation traces
};
// mk(ns) → enabled ? console.debug.bind(console, `[${ns}]`) : () => {}
```

- Raw `console.log` is an ESLint error in `apps/web` (same rule as the API); `debug.*` is the sanctioned path and is tree-shaken to no-ops in prod builds.
- The `vyaya:debug` localStorage flag turns it back on **in prod on your own phone** — the offline-sync issue that only reproduces on Jio between Andheri and Vikhroli is exactly the bug you'll need field diagnostics for. The flag also makes TanStack Query Devtools mount lazily.
- Dev-only additions: TanStack Query Devtools, a `<DebugBar>` (current reqIds in flight, offline queue depth, session age) rendered when the flag is set.

## 6. Feature-Specific Diagnostics

- **Offline queue:** every entry stores `{idemKey, createdAt, attempts, lastError}`. The settings screen ships a small "Sync diagnostics" panel (queue contents, last drain result, force-drain button) — user-facing plumbing beats adb spelunking. Drain conflicts (`409`) breadcrumb as info; `422`s surface in the "needs attention" list _and_ report to GlitchTip once (they mean shared-schema drift — a real bug).
- **Optimistic rollbacks:** every rollback logs a breadcrumb with the mutation key and error class. Frequent rollbacks with `NetworkError` = connectivity (fine); with `ValidationError` = client/server schema drift (bug) — a GlitchTip alert rule watches for the latter pattern.
- **CSV import UI:** file metadata breadcrumbs only (name, size, row count) — never file contents. Mapping-editor state attaches to events on import-page errors (it's config, not data).
- **Error boundaries** report with a `boundary` tag (`route-segment`/`root`/`global`) so "which shell failed" is a facet, and render recovery UIs per FRONTEND.md §8 with the reqId visible.

## 7. Web Vitals & Perf Signals

- `useReportWebVitals` → sampled `navigator.sendBeacon('/api/v1/vitals', {metric, value, route, connection: navigator.connection?.effectiveType})` → Prometheus. Route + connection-type labels answer the real question: _is the dashboard slow on 4G specifically?_
- No RUM vendor, no client tracing — Tempo already times the backend half; the vitals beacon covers the paint half; the gap between them (network) is visible as the difference.

## 8. Environment Matrix

|                  | dev                    | staging        | prod                               |
| ---------------- | ---------------------- | -------------- | ---------------------------------- |
| `debug.*` logger | on                     | on             | off (localStorage flag re-enables) |
| GlitchTip        | off (console fallback) | on, env-tagged | on                                 |
| Query Devtools   | on                     | flag           | flag                               |
| Vitals beacon    | off                    | on             | on                                 |
| Source maps      | local                  | uploaded       | uploaded, not served publicly      |

**Definition of done for any frontend bug:** the fix's PR must answer "would the _next_ occurrence have been diagnosable from GlitchTip + Loki alone?" If not, the missing breadcrumb/tag ships with the fix.
