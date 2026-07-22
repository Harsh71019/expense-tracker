1. yearly report switch in reports.
2. reusable HTTP-level integration test harness for apps/api (boot real NestJS app + supertest) — needed to directly prove auth-guard invariants end-to-end (e.g. Bearer key hitting POST /v1/api-keys gets 403), instead of relying on two separately-tested unit facts (guard rejects no-RequireScopes routes + controller has no RequireScopes decorators).
