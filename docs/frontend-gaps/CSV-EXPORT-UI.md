# CSV Export UI

> Audit date: 2026-07-16  
> Frontend status: **implemented 2026-07-17**  
> Backend status: **ready** — CSV media type, attachment header, query schema, and generated-client contract are published.

## 0. Outcome and acceptance gate

Let a signed-in user download their posted ledger transactions as a CSV, optionally limited to a date range, without weakening the backend's spreadsheet formula-injection protection.

The acceptance demo is: choose a range, download `treasury-ops-export.csv`, open it successfully, verify only posted transactions inside the range are present with IST dates and exact signed INR amounts, and verify descriptions/tags beginning with `=`, `+`, `-`, or `@` are neutralized.

## 1. Verified current state

- `GET /api/v1/export/csv?from=&to=` exists in `apps/api/src/export/export.controller.ts`.
- `ExportService` pages through transactions, filters to posted entries, resolves account/category names, formats IST dates, and produces CSV in `apps/api/src/export/export.service.ts`.
- The response uses `text/csv; charset=utf-8` and attachment filename `treasury-ops-export.csv`.
- `ExportCsvQuerySchema` is in `packages/shared/src/export.ts`.
- Formula-injection neutralization and CSV formatting have tests.
- The route is present in the OpenAPI registry and generated client with a string CSV payload.
- There is no date-range form, export hook, download action, or route in the frontend.

## 2. Backend contract

| Operation            | Query                                  | Response              |
| -------------------- | -------------------------------------- | --------------------- |
| `GET /v1/export/csv` | optional `from`, `to` coerced to dates | `text/csv` attachment |

Columns are:

1. Date
2. Type
3. Status
4. Account
5. Category
6. Description
7. Tags
8. Amount (INR)

Only `posted` transactions are exported. Reversed originals and reversal entries are excluded by the service's current final filter. The UI copy must say `posted transactions`, not `full audit ledger`, unless the backend behavior changes.

## 3. Completed OpenAPI prerequisite

Completed before frontend implementation:

1. Register `ExportCsvQuerySchema` and `GET /v1/export/csv` in `apps/api/src/openapi/registry.ts`.
2. Describe the `text/csv` string/binary response and `Content-Disposition` header accurately.
3. Include auth and RFC 7807 error responses.
4. Regenerate with `pnpm gen:client` and confirm the generated operation exposes the CSV payload without a cast.

Do not add a raw `fetch('/api/v1/export/csv')`; frontend data access must use the generated client.

## 4. Proposed placement and feature slice

```text
apps/web/src/app/(app)/export/page.tsx
apps/web/src/features/export/
├── components/export-csv-form.tsx
├── hooks/use-export-csv.ts
├── model/export-filename.ts
└── index.ts
```

Link `Export data` from `/more` and optionally from `/reports`. A dedicated small route keeps date selection, status, and error recovery understandable on mobile.

## 5. Data and download flow

- Keep `from` and `to` as form values and validate the request with `ExportCsvQuerySchema`.
- Interpret calendar dates consistently with the API's ISO/UTC contract and IST product calendar. Prefer shared time helpers; do not use raw `new Date().getMonth()` logic.
- Use a mutation-style hook because the action produces a user-triggered file rather than cached server state.
- Call the generated client, check its error/result branches, and validate that the payload is a string.
- Create a `Blob` with the server media type, create a temporary object URL, trigger an anchor download, and revoke the URL in `finally`.
- Prefer the server-provided filename when the generated response exposes `Content-Disposition`; otherwise use the documented `treasury-ops-export.csv` constant.
- Do not retry automatically. A user retry is explicit and safe because GET has no side effect.

## 6. UX specification

- Default option: `All posted transactions`.
- Optional range: from date and to date, with visible `Asia/Kolkata` context.
- Prevent `from > to` client-side and rely on the server schema for authoritative validation.
- Submit label: `Download CSV`.
- While generating, show `Preparing export…`; retain dates on failure.
- Success feedback should be modest because browser download behavior varies; do not claim the file was saved if only the response was received.
- Explain the exported columns and that archived account/category names remain dependent on current backend lookup behavior.

## 7. Security, privacy, and accessibility

- Never render the CSV into the DOM or log it; it contains private financial data.
- Preserve backend formula-injection neutralization. Do not post-process cells in the browser.
- Do not include authentication/session data in the filename or query string.
- Date inputs have labels and their validation errors are associated with the fields.
- Download status uses an `aria-live` region without stealing focus.

## 8. Tests

- Contract: OpenAPI contains the CSV media type/query and generated schema compiles.
- Unit: date-range request construction and filename fallback.
- Hook: generated-client call, Blob URL creation/revocation, server error mapping, no automatic retry.
- Component: all-data/range modes, invalid range, pending and error states.
- E2E: seed posted/reversed/formula-like data, download file, inspect header/rows/date range/signed amounts/neutralization.
- Backend tests remain the authority for exact CSV escaping and injection prevention.

## 9. Out of scope

- Excel/XLSX, PDF, JSON, or scheduled exports.
- Exporting imports, assets, valuations, audit logs, or settings.
- Client-side CSV generation.
- Monthly/cashflow reporting; no backend APIs exist.

## 10. Definition of done

- Export route is generated and consumed without hand-written fetch/casts.
- UI describes actual posted-only behavior.
- Formula-injection E2E remains intact.
- Private CSV content is not logged or rendered.
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm test:e2e` passes.
