# TreasuryOps Backend Observability Runbook

This runbook covers the minimum production signals implemented by OBS-009. The
source of truth is the authenticated `GET /api/v1/metrics` endpoint in
Prometheus text format.

## Access and data-safety boundary

- The endpoint requires a valid Better Auth session. An unauthenticated scrape
  receives the standard RFC 7807 `401` response.
- Keep the route behind the existing private/Tailscale or reverse-proxy
  boundary. If Prometheus scrapes it, configure the scrape target with a
  dedicated monitoring session cookie and rotate that session.
- Metric labels are deliberately bounded to HTTP method, route pattern, status
  code, queue name, and queue state. They never contain user ids, account ids,
  transaction descriptions, tags, amounts, cookies, tokens, request ids, job
  ids, or file contents.
- `/api/healthz`, `/api/readyz`, and `/api/v1/metrics` are excluded from HTTP
  request metrics so health polling and scraping do not distort application
  traffic.

Example authenticated check:

```bash
curl --fail-with-body \
  --header 'Cookie: better-auth.session_token=<monitoring-session>' \
  https://expense.example/api/v1/metrics
```

## Metric catalogue

| Metric                                                      | Type    | Meaning                                                                                       |
| ----------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------- |
| `treasuryops_http_requests_total`                           | counter | HTTP request rate and error count by method, route pattern, and status code                   |
| `treasuryops_http_request_duration_ms`                      | summary | In-process HTTP duration sum/count with the same bounded labels                               |
| `treasuryops_db_transaction_retries_total`                  | counter | PostgreSQL serialization/deadlock retries performed by `withTxn`                              |
| `treasuryops_db_transactions_total`                         | counter | Final committed/failed transaction outcomes                                                   |
| `treasuryops_db_transaction_duration_ms`                    | summary | Transaction duration sum/count                                                                |
| `treasuryops_queue_jobs`                                    | gauge   | Live BullMQ depth for `waiting`, `active`, `delayed`, and retained `failed` jobs              |
| `treasuryops_worker_heartbeat_age_seconds`                  | gauge   | Age of the Redis worker heartbeat; `-1` means missing                                         |
| `treasuryops_balance_drift_accounts`                        | gauge   | Accounts with drift in the most recent weekly verification; `-1` means it has never completed |
| `treasuryops_balance_verification_age_seconds`              | gauge   | Age of the latest completed verification; `-1` means absent                                   |
| `treasuryops_recurring_detection_runs_total`                | counter | Shadow runs by completed/degraded/abstained/failed outcome; no tenant label                   |
| `treasuryops_recurring_detection_streams_total`             | counter | Immutable stream revisions produced by shadow runs                                            |
| `treasuryops_recurring_detection_abstained_groups_total`    | counter | Groups withheld by sufficiency or cadence rules                                               |
| `treasuryops_recurring_detection_rows_scanned_total`        | counter | Rows consumed by bounded history reads                                                        |
| `treasuryops_recurring_detection_runtime_ms`                | summary | Pure detector runtime sum/count                                                               |
| `treasuryops_recurring_detection_row_budget_hits_total`     | counter | Runs that explicitly reached the 5,000-row ceiling                                            |
| `treasuryops_recurring_detection_promotion_decisions_total` | counter | Aggregate chronological evaluation decisions (`eligible`/`held`)                              |

Most process counters reset when the API process restarts. Queue and heartbeat values come from
Redis on every scrape. The worker writes balance verification and recurring-detection aggregate
counters to Redis so the separate API process can expose them; those counters persist until the
application Redis namespace is deliberately cleared.

## Minimum dashboard

Use five rows:

1. HTTP rate, 5xx rate, and average duration:
   `rate(treasuryops_http_requests_total[5m])`,
   `rate(treasuryops_http_requests_total{status_code=~"5.."}[5m])`, and
   `rate(treasuryops_http_request_duration_ms_sum[5m]) /
rate(treasuryops_http_request_duration_ms_count[5m])`.
2. Transaction retry rate, failed outcomes, and average duration.
3. Queue depth split by queue/state plus worker heartbeat age.
4. Recurring shadow outcomes, average runtime, scanned rows, and row-budget hits.
5. Balance drift count and balance-verification age.

Do not turn `reqId`, `userId`, account ids, job ids, or batch ids into
Prometheus labels. Use Loki structured-log queries for those high-cardinality
investigations.

## Alerts

Start with these thresholds and tune only from observed production behavior:

| Alert                 | Condition                                                      | Severity | First response                                                                                                                 |
| --------------------- | -------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Worker missing        | heartbeat is `-1` or greater than 60 seconds for 2 minutes     | page     | Check worker container state and Redis connectivity; restart only after reading the last worker error                          |
| Queue failures        | any `state="failed"` gauge is greater than zero for 5 minutes  | page     | Open Bull Board, inspect the first failed job and its correlated logs, then retry only after the cause is understood           |
| Queue backlog         | `waiting + delayed` remains above 20 for 15 minutes            | warn     | Compare active count and worker heartbeat; check dependency and job duration logs                                              |
| HTTP 5xx              | 5xx ratio exceeds 2% with at least 10 requests in 10 minutes   | page     | Group by route, take one response `x-request-id`, then trace it in Loki                                                        |
| Transaction retries   | retry rate exceeds 2% of committed transactions for 15 minutes | warn     | Inspect `txn.retry` logs for `40001`/`40P01`, then locate the contending write paths                                           |
| Transaction failures  | failed outcome increases in 5 minutes                          | page     | Query the matching `txn.failed` log and preserve the request id before retrying any operation                                  |
| Balance drift         | drift gauge is greater than zero                               | page     | Stop new release work, run the invariant suite, and inspect immutable audit/ledger rows; never repair by editing a transaction |
| Verification stale    | verification age exceeds 8 days or is `-1` after initial setup | page     | Confirm the worker role and Sunday 03:00 IST cron ran; check `balances.verified` logs                                          |
| Scheduled run failed  | `scheduler.run_failed` or `scheduler.run_overlong` log appears | page     | Query `scheduled_job_runs` by `runId`; fix the cause before invoking the same deterministic window again                       |
| Scheduled run missing | `scheduler.run_missing` log appears                            | page     | Confirm worker heartbeat, then compare the latest row for that `jobName` with its documented IST schedule                      |

The scheduler log alerts are deliberately based on low-cardinality `event` and `jobName` fields.
Use `runId` only while investigating one incident. Run history is retained for 30 days; a live
`running` row whose `lease_until` is in the past will be marked `failed` by the watchdog.

If Redis is unavailable, `/api/readyz` and the metrics scrape can both fail.
Treat that as a dependency incident rather than interpreting missing queue
samples as zero.

## Correlation playbook

HTTP responses carry `x-request-id`. Queue producers copy that value into a
validated `correlationId` job-data field, and workers reopen the logging
`AsyncLocalStorage` context with it as `reqId`. A request and its worker job can
therefore be followed with:

```logql
{service=~"api|worker"} | json | reqId="<x-request-id>"
```

For import-specific investigation, add `batchId="<batch-id>"`. For a failed
BullMQ job, use Bull Board to get the job id and query `jobId="<job-id>"`.

## Verification after deployment

1. Request `/api/v1/metrics` without a session and confirm `401`.
2. Request it with a session and confirm Prometheus text plus all metric
   families above.
3. Confirm a normal API request increases `treasuryops_http_requests_total`.
4. Confirm `treasuryops_worker_heartbeat_age_seconds` stays below 60.
5. Confirm all queues are present, including `recurring-detection` and a `failed` state.
6. After the weekly verification, confirm drift is `0` and verification age
   resets near zero.
