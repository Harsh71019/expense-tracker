# Phase 3 UI Implementation Guide — CSV Imports

> Hand this file to whoever/whatever implements it. Self-contained — quotes the rules that
> matter from `AGENTS.md`/`FRONTEND.md`/`BACKEND.md` rather than assuming they've been read.
> Companion to `PHASE2-UI-GUIDE.md`, which this one assumes is **already implemented** (it is,
> as of this writing — verified against the actual repo below, not assumed).

## 0. What this closes out

`IMPLEMENTATION-PLAN.md` Phase 3 ("CSV Import Pipeline") is done on the backend: upload, async
parse (real BullMQ, not a stub), preview, row edit, commit, and revert are all built, tested
(unit + integration against real Mongo + real Redis), and pushed. What's missing is entirely the
UI — `FRONTEND.md`'s **F2** milestone: _"Imports: dropzone, mapping editor, preview table with
dupe badges + row toggles, commit progress, batch revert."_

**Gate 3 (the thing this UI must make demonstrable):**

> Import a real HDFC statement end-to-end; kill the worker mid-commit and re-run → row count
> exact, no dupes; revert the whole batch → balance identical to pre-import to the paisa;
> re-import → clean.

The backend already guarantees the resumability and balance-correctness parts (proven with tests
that simulate a mid-commit crash). This guide is about the client wiring needed to _use_ that
pipeline: pick a file + describe its columns, review what got staged (with duplicates and parse
problems visibly flagged), fix categories, commit, and revert if needed.

**Out of scope for this guide** (don't build these — separate work):

- **Column-mapping presets (HDFC/ICICI) and the rule-based category suggester** — being built
  server-side in parallel with this guide. Build the mapping form generically (plain text inputs
  for column names, see §6) — presets are a progressive enhancement that slot into the same form
  later (a preset dropdown that pre-fills the text inputs), not a blocker for anything here.
- **CSV export** (`GET /export/csv`) — separate feature, not part of imports.
- Budgets, recurring, reports — later phases, unrelated.

---

## 1. Current state — what already exists, verified against the repo just now

**Everything from `PHASE2-UI-GUIDE.md` is built and working** — the generated API client, the
error taxonomy, the query-key factory, the ledger row / quick-add / transactions-list features,
and every `components/ui/` primitive it specified. Concretely, reuse these as-is:

**Data layer (`apps/web/src/lib/`):**

- `lib/api/client.ts` — `export const apiClient = createClient<paths>({ baseUrl: "/api" })`, the
  browser-side typed client (`openapi-fetch` + `openapi-typescript`-generated types).
- `lib/api/server.ts` — `getServerApiClient()`, `React.cache()`-wrapped, cookie-forwarded, for
  RSC loaders.
- `lib/api/problem.ts` — `toAppError(error: unknown, status: number): AppError` and
  `toNetworkError(error: unknown): NetworkError`. **Exact current signature** — `toAppError`
  takes the parsed problem+json body _and_ the HTTP status separately (openapi-fetch splits
  these). Maps to `AuthError` (401) / `ConflictError` (409) / `ValidationError` (422, carries
  `.fields: readonly ProblemFieldError[]`) / `NetworkError` (5xx) / base `AppError` (else).
- `lib/errors.ts` — the `AppError` family above. Branch on `instanceof`, never on message
  strings or raw status codes.
- `lib/query/keys.ts` — the **only** place query keys are written:
  ```ts
  export const qk = {
    txns: (filters: ListTransactionsQuery) => ["txns", filters] as const,
    accounts: () => ["accounts"] as const,
    categories: () => ["categories"] as const
  } as const;
  ```
  **You will extend this file** — see §4.
- `lib/query/provider.tsx` — the `QueryClientProvider`, already mounted in the root layout.
  Nothing to do here.
- `lib/api/generated/schema.d.ts` — openapi-typescript output. **Never hand-edit.** Regenerated
  via the root `pnpm gen:client` script. **Currently stale for imports** — see §3, this is the
  first thing to fix.

**Reference implementation to copy the pattern from, file-for-file (`features/transactions/`,
`features/quick-add/`):**

- `features/transactions/server/get-txn-page.ts` — the RSC-loader pattern: `cache()`-wrapped,
  calls `getServerApiClient()`, `Schema.safeParse()`s the response, fails closed to an empty
  page (never throws) with a `debug.api(...)` breadcrumb on failure. **Copy this shape exactly**
  for the imports batch-history and preview loaders.
- `features/quick-add/hooks/use-accounts.ts` — the `useQuery` read-hook pattern: `queryFn` calls
  `apiClient.GET(path)`, checks `result.error !== undefined` → `throw toAppError(result.error,
result.response.status)`, `Schema.safeParse(result.data)` → throw on failure, return
  `parsed.data`. Wrap the whole thing in try/catch → `throw toNetworkError(error)` for anything
  that isn't already an `Error`. **Copy this shape exactly** for every new read hook below.
- `features/quick-add/hooks/use-create-txn.ts` — the `useMutation` write-hook pattern: same
  error handling, plus `onSettled` invalidation. **Copy this shape** for upload/commit/revert.
- `features/quick-add/components/quick-add-form.tsx` + `account-setup.tsx` — react-hook-form +
  `zodResolver`-free (this codebase's actual quick-add form validates via RHF's `defaultValues`
  and maps server `ValidationError.fields` back with `form.setError`, using a
  `fieldErrorName()` allow-list function — copy that mapping pattern for the mapping form's field
  errors too, swapped to `ColumnMapping`'s field names).

**Design primitives (`components/ui/`) — reuse as-is:**

- `button.tsx`, `input.tsx`, `amount-input.tsx`, `money.tsx`, `skeleton.tsx`, `empty-state.tsx`.
- `badge.tsx` — currently only has `variant: "reversed" | "pending"`. **You will add variants**
  — see §5.

**Routes that exist (don't touch):** `(app)/page.tsx`, `(app)/transactions/page.tsx`,
`(app)/add/page.tsx`, `(app)/reports/page.tsx` (still a stub, unrelated), `(app)/more/page.tsx`.

**Nav:** `(app)/layout.tsx` has a 5-item bottom tab bar (Home / Transactions / Add / Reports /
More) per `FRONTEND.md`'s explicit design — don't add a 6th tab. Put the imports entry point as
a link/card on the **More** page instead (see §7).

---

## 2. Non-negotiable rules (from `AGENTS.md` — same ones `PHASE2-UI-GUIDE.md` listed, repeated because they apply here too)

1. **Money is always integer paise.** Render only through `<Money>`.
2. **TypeScript strict, zero escape hatches**: no `any`, no `as` casts (except `as const` and
   narrowing `unknown` after a runtime check), no `@ts-ignore`, `@ts-expect-error` only in tests
   with a comment, no `!`, no `enum`.
3. **Types are derived, not duplicated** — `ImportBatch`, `StagedRow`, `ColumnMapping`, etc. all
   already exist in `@vyaya/shared` (`packages/shared/src/import.ts`). Import them, never
   hand-write an equivalent shape.
4. **Runtime boundaries are parsed with zod, not asserted.**
5. **Server Components by default; `"use client"` only at the interactive leaf.**
6. **Feature isolation** — other features/routes import `features/imports/` only via its
   `index.ts`.
7. **Definition of done:** `pnpm lint && pnpm typecheck && pnpm test` green, before calling any
   part of this done.

**Import-specific ones, new to this guide:**

8. **Never trust a client-side row count or balance.** After commit/revert, the account balance
   changed server-side — invalidate `qk.accounts()` (and any account-detail query) exactly like
   quick-add's `useCreateTxn` already does, don't try to compute the new balance client-side.
9. **A staged row with parse `problems` cannot be included.** The backend already enforces
   `include: false` for any row where `parsed` is `undefined` (a row that failed to parse has
   nothing committable). **Disable the include-toggle in the UI for such rows** — don't let the
   user flip it on. (A server-side guard for this is being added in parallel; treat the UI guard
   as required regardless, not optional defense-in-depth.)
10. **The upload form's idempotency story is different from quick-add's.** There's no
    `Idempotency-Key` header on `POST /v1/imports` — duplicate-upload protection works via
    `fileHash` server-side instead (uploading the identical bytes twice is safe: the second
    attempt either creates a harmless second `pending` batch, or 409s if the first was already
    committed — see §8's error table). You do **not** need to generate/track a client-side
    idempotency key for the upload form, unlike quick-add's transaction form.

---

## 3. Part A — OpenAPI registry gap (do this first)

Checked `apps/api/src/openapi/registry.ts` just now: **only `POST /v1/imports` is registered**
(file upload's multipart shape is already sorted out — see below). The other five imports
endpoints aren't in the spec yet, so `lib/api/generated/schema.d.ts` doesn't know about them and
`apiClient.GET("/v1/imports/...")` won't typecheck until this is fixed.

### A1 — Add the missing paths to `apps/api/src/openapi/registry.ts`

Import these additional schemas from `@vyaya/shared` at the top of the file (alongside the
existing imports): `StagedRowSchema`, `StagedRowPageSchema`, `UpdateStagedRowSchema`,
`PreviewStagedRowsQuerySchema`, `ImportBatchIdSchema`, `StagedRowIdSchema`.

Register `.meta({ id: ... })` aliases next to the existing ones (`const ImportBatch = ...` is
already there; add `StagedRow`, `StagedRowPage`).

Add param helpers next to `accountId`/`categoryId`/etc.:

```ts
const importBatchId = z.object({ importBatchId: ImportBatchIdSchema });
const importBatchAndRowId = z.object({
  importBatchId: ImportBatchIdSchema,
  stagedRowId: StagedRowIdSchema
});
```

Then five `registry.registerPath({...})` calls, matching the exact style already used for
accounts/transactions in that file:

```ts
registry.registerPath({
  method: "get",
  path: "/v1/imports",
  security: secured,
  responses: {
    200: { description: "Import batches", ...json(z.array(ImportBatch)) },
    ...problemResponses
  }
});

registry.registerPath({
  method: "get",
  path: "/v1/imports/{importBatchId}/preview",
  security: secured,
  request: { params: importBatchId, query: PreviewStagedRowsQuerySchema },
  responses: {
    200: { description: "Staged row page", ...json(StagedRowPage) },
    404: { description: "Not found", ...json(ProblemDetails) },
    ...problemResponses
  }
});

registry.registerPath({
  method: "patch",
  path: "/v1/imports/{importBatchId}/rows/{stagedRowId}",
  security: secured,
  request: { params: importBatchAndRowId, body: json(UpdateStagedRowSchema) },
  responses: {
    200: { description: "Updated row", ...json(StagedRow) },
    404: { description: "Not found", ...json(ProblemDetails) },
    ...problemResponses
  }
});

registry.registerPath({
  method: "post",
  path: "/v1/imports/{importBatchId}/commit",
  security: secured,
  request: { params: importBatchId },
  responses: {
    200: { description: "Committed batch", ...json(ImportBatch) },
    404: { description: "Not found", ...json(ProblemDetails) },
    409: { description: "Not staged / already committed", ...json(ProblemDetails) },
    ...problemResponses
  }
});

registry.registerPath({
  method: "post",
  path: "/v1/imports/{importBatchId}/revert",
  security: secured,
  request: { params: importBatchId },
  responses: {
    200: { description: "Reverted batch", ...json(ImportBatch) },
    404: { description: "Not found", ...json(ProblemDetails) },
    409: { description: "Not committed", ...json(ProblemDetails) },
    ...problemResponses
  }
});
```

### A2 — Regenerate

```bash
pnpm gen:client
```

Commit the regenerated `apps/web/src/lib/api/generated/schema.d.ts` alongside the registry
change — CI diffs it (per `AGENTS.md` §5).

### A3 — The multipart upload's typed shape (already decided, don't relitigate)

The registry already declares `POST /v1/imports`'s body as:

```ts
multipart/form-data: { file: string (binary), accountId: string, mapping: string (JSON) }
```

`openapi-fetch` supports multipart bodies — pass a real `FormData` instance as `body`, **not** a
plain object:

```ts
const formData = new FormData();
formData.append("file", file); // a browser File object
formData.append("accountId", accountId);
formData.append("mapping", JSON.stringify(mapping)); // ColumnMapping, JSON-stringified — the API parses this field as a JSON string, not nested multipart fields
const result = await apiClient.POST("/v1/imports", { body: formData });
```

If `openapi-fetch`'s generated types fight you here (multipart typing is a known rough edge
across most OpenAPI-client generators, not specific to this stack), it is an acceptable,
explained exception to fall back to a narrower manual type for just this one call site — note it
with a comment explaining why, the way `apps/api/src/imports/imports.controller.ts` already
documents its own `@types/multer`/`@types/express` incompatibility. Don't let this one rough
edge block the rest of the typed-client discipline.

---

## 4. Part B — extend the query-key factory

`lib/query/keys.ts` — add:

```ts
export const qk = {
  txns: (filters: ListTransactionsQuery) => ["txns", filters] as const,
  accounts: () => ["accounts"] as const,
  categories: () => ["categories"] as const,
  importBatches: () => ["import-batches"] as const,
  importPreview: (batchId: string) => ["import-preview", batchId] as const
} as const;
```

---

## 5. Part C — new design primitives

**`components/ui/badge.tsx`** — extend `BadgeVariant` with two more entries and matching
classes, following the exact pattern the existing two use (border/bg/text at low opacity, keyed
off a semantic token):

- `"duplicate"` — a staged row whose `dedupeHash` already matches an existing transaction or
  another row in the same file. Suggest reusing `--color-reversed` (muted, "this won't do
  anything new") rather than introducing a new token.
- `"problem"` — a row that failed to parse. Use `--color-expense` (this needs the user's
  attention, same alarm register as a negative amount).

**`components/ui/file-drop-zone.tsx`** (new) — a minimal drag-and-drop + click-to-browse file
picker. Props: `accept: string` (`.csv`), `onFileSelected: (file: File) => void`,
`selectedFileName?: string`. Keep it dumb (no upload logic, no validation beyond the browser's
native `accept` filter — real validation is server-side and already returns
`InvalidImportFileError` with a specific message on `422`, surfaced via the form's error
handling same as any other `ValidationError`). Drag-over state via local `useState`, styled with
existing tokens (`border-dashed border-border`, `border-accent` on drag-over).

---

## 6. Part D — Feature: `features/imports/` — batch history + upload

New feature folder. Structure mirrors `features/quick-add/` and `features/transactions/`:

```
features/imports/
├─ server/
│  ├─ get-import-batches.ts      # RSC loader, mirrors get-txn-page.ts
│  └─ get-staged-rows.ts          # RSC loader for the preview's first page
├─ hooks/
│  ├─ use-import-batches.ts       # client re-fetch after actions (mirrors use-accounts.ts)
│  ├─ use-staged-rows.ts          # paginated preview (see §7's infinite-scroll note)
│  ├─ use-upload-import.ts        # mutation, multipart (see §3 A3)
│  ├─ use-update-staged-row.ts    # mutation, PATCH row
│  ├─ use-commit-batch.ts         # mutation, POST commit
│  └─ use-revert-batch.ts         # mutation, POST revert
├─ components/
│  ├─ import-batch-list.tsx       # batch history table/list
│  ├─ import-batch-status.tsx     # small status→label+color mapping, used in list + preview header
│  ├─ mapping-form.tsx            # the column-mapping fields (see below)
│  ├─ upload-form.tsx             # FileDropZone + account select + MappingForm + submit
│  ├─ staged-row-table.tsx        # the preview table
│  └─ staged-row.tsx              # one row: parsed fields, badges, include checkbox, category select
└─ index.ts                       # public exports: ImportBatchList, UploadForm, StagedRowTable, and the batch-status helper
```

**`import-batch-status.tsx`** — one small pure function/component mapping `ImportBatchStatus`
(`"pending" | "staged" | "committed" | "reverted" | "failed"`) to a label + `<Badge>` variant.
`pending`/`staged` → neutral, `committed` → success-ish (reuse `--color-income` token for "money
landed"), `reverted` → `"reversed"` badge variant (already exists, same semantic), `failed` →
`"problem"` badge variant (§5).

**`mapping-form.tsx`** — plain controlled inputs (no react-hook-form needed for this one, it's
small — but RHF is fine too if you prefer consistency with quick-add; either is acceptable),
producing a `ColumnMapping` object:

- `date` (text, column header name) + `dateFormat` (`<select>` of the three `DateFormatSchema`
  values: `DD/MM/YYYY`, `MM/DD/YYYY`, `YYYY-MM-DD` — **never let this default silently**, per
  `BACKEND.md` §4's "never auto-guess" rule; require an explicit selection, don't preselect one)
- `description` (text, column header name)
- `amountConvention` (`<select>`: `single_signed` | `debit_credit_cols`) — toggles which fields
  show next:
  - `single_signed` → one `amount` text field
  - `debit_credit_cols` → `debit` + `credit` text fields
- Client-side validation via `ColumnMappingSchema.safeParse()` before submit (same schema the
  server validates with — one source of truth, per rule §2.3 above). The schema's `.refine()`s
  already enforce "amount required for single_signed" / "debit+credit required for
  debit_credit_cols" — surface those messages inline, don't re-derive the logic.

**`upload-form.tsx`** (`"use client"`): `FileDropZone` → holds the selected `File` in state →
account `<select>` (reuse `useAccounts()` from quick-add — **import it via
`features/quick-add`'s public `index.ts`**, don't deep-import; if `quick-add`'s `index.ts`
doesn't currently export `useAccounts`, add it there rather than duplicating the hook) → embedded
`MappingForm` → submit button calling `useUploadImport()`. On success, navigate to
`/imports/{batch.id}` (or wherever the preview route lands — see §7) so the user lands on the
now-parsing batch. Show a "no accounts yet" empty state identical in spirit to quick-add's
`AccountSetup` fallback if the account list is empty.

**`use-upload-import.ts`** — mirrors `use-create-txn.ts`'s error-handling shape exactly, but:

- `body` is a `FormData` (§3 A3), not a JSON object.
- No idempotency header (rule §2.10).
- `onSettled` invalidates `qk.importBatches()`.

---

## 7. Part E — Feature: preview (staged rows)

**`staged-row.tsx`** — one row of the preview table:

- If `parsed` is defined: `<Money minor={parsed.amountMinor} variant={parsed.type} signed />`,
  formatted `parsed.occurredAt` (IST, same `Intl.DateTimeFormat("en-IN", {..., timeZone:
"Asia/Kolkata"})` pattern `PHASE2-UI-GUIDE.md` specified for `TxnRow`), `parsed.description`.
- If `parsed` is undefined: render the raw cell values (`row.raw`, a `Record<string, string>`)
  instead, so the user can see _why_ it failed — join them as `key: value` pairs or a compact
  inline list.
- `problems.length > 0` → one `<Badge variant="problem">` per problem message (or a single badge
  with a count + tooltip/expand if that reads cleaner — either is fine).
- `isDuplicate` → `<Badge variant="duplicate">`.
- Include checkbox: `checked={row.include}`, `disabled={row.parsed === undefined}` (rule §2.9),
  `onChange` calls `useUpdateStagedRow()` with `{ include: !row.include }`.
- Category `<select>`: options from `useCategories()` (reuse from quick-add, filtered to
  `kind === row.parsed?.type` the same way quick-add's form already filters by type), value
  `row.suggestedCategoryId ?? ""`, `onChange` calls `useUpdateStagedRow()` with
  `{ suggestedCategoryId: value === "" ? null : value }` — **explicit `null` clears it**, same
  convention `UpdateTransactionSchema`/`UpdateStagedRowSchema` both already use.

**`staged-row-table.tsx`** — renders the page of rows + a "load more" control. Preview is
cursor-paginated (`PreviewStagedRowsQuerySchema`: `cursor?`, `limit` default 50, max 200) — for
a batch that can have up to 50,000 rows, **don't fetch it all at once**. A `useInfiniteQuery`
(same shape `PHASE2-UI-GUIDE.md` specified for the transaction list) is the right tool here, more
so than for transactions — reuse that pattern.

**`use-staged-rows.ts`** — `useInfiniteQuery` keyed on `qk.importPreview(batchId)`,
`initialData` seeded from `get-staged-rows.ts`'s RSC first page (same RSC→client handoff
`PHASE2-UI-GUIDE.md` §4 describes), `getNextPageParam` reads `pageInfo.nextCursor`/`hasMore`.

**Row-edit invalidation:** `use-update-staged-row.ts`'s `onSettled` should invalidate
`qk.importPreview(batchId)` — a toggled include/category needs to show up on refetch. It does
**not** need to invalidate `qk.importBatches()` (stats like `duplicates`/`staged` counts on the
batch itself aren't recomputed by a row-level PATCH — check `apps/api/src/imports/imports.service.ts`'s
`updateRow` if you need to confirm; as of this writing it only mutates the row, not batch stats).

---

## 8. Part F — Feature: commit + revert

Both are simple: a button, a confirmation (a real one is fine here — unlike a single-transaction
reverse, committing/reverting a whole batch is a bigger action worth a "are you sure" — a native
`confirm()` is acceptable if no dialog primitive exists yet, or build a minimal one), then
`useCommitBatch()`/`useRevertBatch()`.

- **Commit** button: only rendered/enabled when `batch.status === "staged"`. On success,
  invalidate `qk.importBatches()` **and** `qk.accounts()` (balance changed) **and**
  `["txns"]` (new transactions exist now — reuse the same broad invalidation `use-create-txn.ts`
  already does for `qk.accounts()`).
- **Revert** button: only rendered/enabled when `batch.status === "committed"`. Same
  invalidation set on success.
- Commit can take a while for a large batch (up to 50k rows, 200/chunk = up to 250 sequential
  Mongo transactions server-side). The endpoint is synchronous from the client's perspective (no
  job-status polling exists — `commitBatch`/`revertBatch` run the _entire_ chunked loop inside
  one HTTP request/response, per how they're actually implemented). **Show a clear pending state
  on the button** (disabled + spinner/"Committing…" label) for the duration — don't let a
  double-click fire two concurrent commits. A progress bar showing "chunk N of M" is not
  currently possible (no incremental progress is streamed to the client) — don't build one; a
  simple indeterminate pending state is the honest representation of what the backend actually
  does today.

**Error surfacing:** `409 import.invalid_state` (wrong status for the action — e.g. double-commit
via a race) and `409 import.already_committed` (upload-time duplicate) both map to `ConflictError`
via `toAppError` already — show `.message` in a toast/inline banner, no special-casing needed
beyond what `AppError`'s taxonomy already gives you.

---

## 9. Part G — wire the routes

```
app/(app)/imports/page.tsx                    # RSC: ImportBatchList + a link to /imports/new
app/(app)/imports/new/page.tsx                # client shell: UploadForm
app/(app)/imports/[batchId]/page.tsx          # RSC: batch status header + StagedRowTable + commit/revert actions
```

Each route file stays thin (rule §2.7) — fetch via `features/imports/server/*`, render
`features/imports/components/*`. `[batchId]/page.tsx` needs the batch itself (for its status, to
know whether to show commit or revert) — add a `getImportBatch(batchId)` RSC loader alongside
`getImportBatches()` if one doesn't already cover the single-batch case (the `GET
/v1/imports/{id}/preview` response doesn't include the batch, only its rows — you need the
`GET /v1/imports` list response and find by id, or note this as a small gap: there's no
`GET /v1/imports/{id}` single-batch endpoint currently, only list + preview. Fetching the full
list and filtering client/server-side for one id is wasteful but correct; flag it back if a
dedicated single-batch `GET` endpoint would help and it can be added quickly on the backend side.)

**Nav entry:** add a link/card to `/imports` on `(app)/more/page.tsx`, e.g. a
`bg-surface-elevated` card matching the existing "Signed in as" card's styling, labeled "Import
statement" or similar.

---

## 10. Appendix — API reference (verified against the actual controller + shared schemas just now)

All under `/api/v1/imports`, all behind `AuthGuard`.

| Method  | Path                                           | Body                                                          | Response                               | Notes                                                                                                                 |
| ------- | ---------------------------------------------- | ------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `POST`  | `/v1/imports`                                  | multipart: `file`, `accountId`, `mapping` (JSON string)       | `ImportBatch` (201, `Location` header) | Validates ext/MIME/size(5MB)/~row-count(50k); 409 `import.already_committed` if this exact file was already committed |
| `GET`   | `/v1/imports`                                  | —                                                             | `ImportBatch[]`                        | no pagination, newest first                                                                                           |
| `GET`   | `/v1/imports/:importBatchId/preview`           | query: `cursor?`, `limit?` (default 50, max 200)              | `{ items: StagedRow[], pageInfo }`     | 404 if batch doesn't exist/isn't yours                                                                                |
| `PATCH` | `/v1/imports/:importBatchId/rows/:stagedRowId` | `{ include?: boolean, suggestedCategoryId?: string \| null }` | `StagedRow`                            | at least one field required; `null` clears the category                                                               |
| `POST`  | `/v1/imports/:importBatchId/commit`            | —                                                             | `ImportBatch`                          | 409 `import.invalid_state` unless batch is `"staged"`                                                                 |
| `POST`  | `/v1/imports/:importBatchId/revert`            | —                                                             | `ImportBatch`                          | 409 `import.invalid_state` unless batch is `"committed"`                                                              |

**`ImportBatch`**: `{ id, userId, accountId, filename, fileHash, mapping: ColumnMapping, status: "pending"|"staged"|"committed"|"reverted"|"failed", stats: { total, staged, duplicates, committed }, committedAt?, revertedAt?, createdAt, updatedAt }`

**`ColumnMapping`**: `{ date: string, description: string, dateFormat: "DD/MM/YYYY"|"MM/DD/YYYY"|"YYYY-MM-DD", amountConvention: "single_signed"|"debit_credit_cols", amount?: string, debit?: string, credit?: string }`

**`StagedRow`**: `{ id, batchId, rowNumber, raw: Record<string,string>, parsed?: { occurredAt, amountMinor, type, description }, dedupeHash?, suggestedCategoryId?, problems: string[], isDuplicate: boolean, include: boolean }`

**Error codes new in this phase** (added to the catalog in `packages/shared/src/errors/codes.ts`):
`import.invalid_file` (422 — bad extension/MIME/size/row-count), `import.already_committed` (409
— upload-time fileHash reuse guard), `import.invalid_state` (409 — commit/revert called on a
batch in the wrong status). All flow through the same `ProblemDetails`/`toAppError` machinery
already wired up — no new client-side error-handling code needed beyond what's already there.

---

## 11. Testing checklist (maps to Gate 3)

- [ ] Upload form: selecting a non-`.csv` file either is blocked client-side (native `accept`) or
      surfaces the server's `422 import.invalid_file` cleanly.
- [ ] Mapping form: submitting `single_signed` without an `amount` column, or
      `debit_credit_cols` without both `debit`/`credit`, is caught client-side via
      `ColumnMappingSchema.safeParse()` before the request fires.
- [ ] After upload, the batch appears in the history list with status `pending`, then (once the
      background worker finishes) `staged` — either poll/refetch or note that a manual refresh
      is acceptable for this phase (no live job-status push exists).
- [ ] Preview table: a row with `problems` shows the problem badge(s) and its include checkbox is
      disabled and unchecked.
- [ ] Preview table: a row with `isDuplicate: true` shows the duplicate badge.
- [ ] Toggling include / setting a category on a row persists (PATCH fires, refetch shows the
      change).
- [ ] Commit button only appears for a `staged` batch; after commit, batch status flips to
      `committed`, the account balance (check `/transactions` or the dashboard) reflects the net
      change, and the new transactions are visible in the transaction list with linkage back
      being at least inferable (they'll just appear as regular posted transactions — no special
      "imported" marker is exposed via the API today, which is fine/expected).
- [ ] Revert button only appears for a `committed` batch; after revert, balance returns exactly
      to its pre-commit value, batch status flips to `reverted`.
- [ ] Re-uploading the exact same file after a revert succeeds (creates a fresh batch) — this is
      the Gate 3 "re-import → clean" requirement, and depends on the migration 010 fix already
      shipped server-side (only a _committed_ duplicate is rejected, not a reverted one).

---

## 12. Definition of done

```bash
pnpm gen:client   # after §3's registry changes — commit if the spec/schema diff is non-empty
pnpm lint
pnpm typecheck
pnpm test
```

All green, zero warnings, plus the manual checklist in §11 run against a real `pnpm dev` session
with an actual CSV file (even a hand-made one with a few rows is enough to prove the flow — a
real HDFC statement is the ideal final check but not required to call this done).
