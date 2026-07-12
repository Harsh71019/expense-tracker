# Debugging Vyaya

## A request misbehaved

1. Read the `x-request-id` response header or the frontend error metadata.
2. Query Loki: `{service=~"api|worker"} | json | reqId="<request-id>"`.
3. Follow the event stream (`txn.created`, `txn.reversed`, `idem.duplicate`) across API and worker logs.

## A balance looks wrong

1. Treat `audit_log` and the immutable ledger as the source of truth, not logs.
2. Run the balance verification job when it is available.
3. Use the audit entry's request id to correlate the relevant Loki records.

## A request failed unexpectedly

Unexpected exceptions emit `http.unexpected_error` at error level. Expected validation, domain, and HTTP errors return RFC 7807 responses without creating an operational error event.

## Logging rules

- Logs are JSON on stdout and Docker rotates them at 10 MB × 3 files.
- Secrets, cookies, authorization headers, passwords, tokens, and Mongo URIs are structurally redacted.
- `reqId`, `userId`, and job identifiers remain JSON fields, never Loki labels.
- GlitchTip and OpenTelemetry exporters are enabled only once their endpoints are configured.
