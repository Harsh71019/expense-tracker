# Saved Import Mapping Reuse UI

> Audit date: 2026-07-16  
> Frontend status: **implemented 2026-07-17**  
> Backend status: **ready** — the owned-account lookup, 404 semantics, OpenAPI path, and generated client are complete.

## 0. Outcome and acceptance gate

When a user selects an account on the CSV import form, prefill the mapping from that account's most recent import while keeping the mapping fully reviewable and editable before upload.

The acceptance demo is: import an HDFC CSV with a valid mapping, start another import to the same account and see that mapping restored, switch to an account with no history and see a clean form, then edit the restored mapping and upload successfully.

## 1. Verified current state

- `GET /api/v1/imports/accounts/:accountId/mapping` exists in `apps/api/src/imports/imports.controller.ts`.
- `ImportsService.getSavedMapping()` returns the latest batch mapping for that user/account or `null`.
- `AccountImportMappingSchema` and mapping types exist in `packages/shared/src/import.ts`.
- The route is present in OpenAPI and the generated web client.
- `UploadForm` changes only local `accountId`; it never fetches a mapping.
- `MappingForm` owns an `emptyDraft` and has no prop for initial/reset values.
- The rest of the import UI—upload, preview, staged-row edits, commit, and revert—already exists.

## 2. Backend contract

| Operation                                      | Request         | Response                  |
| ---------------------------------------------- | --------------- | ------------------------- |
| `GET /v1/imports/accounts/{accountId}/mapping` | account path id | `{ mapping: ColumnMapping | null }` |

The mapping is the most recent stored batch mapping for the selected account. It is not a separate named preset and there is no save/delete mapping endpoint. A new mapping becomes reusable because it is stored with a newly created import batch.

Supported conventions and formats are already defined by `ColumnMappingSchema`, `AmountConventionSchema`, and `DateFormatSchema`; do not duplicate them in web types.

## 3. Completed OpenAPI prerequisite

1. The route, `accountId` params, and `AccountImportMappingSchema` response are registered.
2. Auth, owned-active-account `404` behavior, and problem+json responses are included.
3. The generated client is current.
4. OpenAPI/controller coverage prevents registry drift.

Do not add a raw fetch to this endpoint.

## 4. Proposed file changes

```text
apps/web/src/features/imports/
├── hooks/use-saved-import-mapping.ts
├── components/upload-form.tsx
├── components/mapping-form.tsx
└── model/mapping-draft.ts
apps/web/src/lib/query/keys.ts
```

This belongs inside the existing imports feature and does not need a new route.

Add `qk.importMapping(accountId)` or an equivalent centralized key.

## 5. State model and race handling

- Fetch only after a non-empty, schema-valid account id is selected.
- Parse the response with `AccountImportMappingSchema`.
- Make `MappingForm` controlled or give it a typed `initialMapping` plus a stable reset mechanism; do not mutate its internal state from the parent through refs.
- Track whether the user has edited the mapping since the current account selection.
- If account A's request resolves after the user switches to account B, it must not overwrite B's form. Use the query key/account id as the source of truth.
- If the user edits while the saved mapping is loading, do not overwrite their edits when the request resolves. Show a `Use saved mapping` action instead.
- Switching to an account with `mapping: null` resets to empty only after explicit account change; a background refetch should not destroy a draft.

## 6. UX specification

States after account selection:

- Loading: compact `Checking saved mapping…` status; form can remain visible.
- Mapping found and untouched: prefill fields and show `Using your last mapping for this account`.
- Mapping found after user edits: preserve draft and offer `Use saved mapping`.
- No mapping: show the empty mapping form without an error.
- Request failure: keep manual mapping available and show a non-blocking retry message.

Always render the prefilled fields. A saved mapping is convenience, not a hidden automatic decision.

Presets already defined in shared code are a separate optional chooser. Do not label the last-used mapping as a bank preset.

## 7. Cache behavior

- A successful upload for account X should invalidate `qk.importMapping(X)` because the new batch becomes the latest source.
- Existing import-batch/preview invalidations remain unchanged.
- A saved-mapping GET is safe to retry according to normal query defaults.
- Cache per account, never under one global key.

## 8. Accessibility and error behavior

- Status changes use a polite live region.
- `Use saved mapping` is a real button and announces that current edits will be replaced.
- Account switching preserves the selected file unless the user clears it.
- Mapping validation stays field-specific and uses the shared schema.
- No saved mapping is an ordinary empty state, not a red error.

## 9. Tests

- Unit: `ColumnMapping` ↔ form draft conversion for both amount conventions.
- Hook: disabled empty account, per-account query keys, null response, validation failure, and retry.
- Component: prefill, no mapping, failed lookup, account-switch race, edit-before-response, explicit overwrite action.
- Regression: new upload invalidates only the selected account's saved mapping plus existing batch keys.
- E2E: first upload establishes mapping; second form restores it; another account stays empty; edited restored mapping is submitted.

## 10. Out of scope

- Named/versioned mappings.
- Deleting mappings.
- Automatically detecting columns from file contents.
- Sharing mappings across accounts or users.
- Changing backend persistence from `latest batch` to a dedicated collection.

## 11. Definition of done

- Endpoint is in OpenAPI/generated client.
- Mapping is parsed, account-scoped, race-safe, and never silently overwrites user input.
- Existing import functionality and caps remain unchanged.
- No new hand-written fetch is introduced.
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm test:e2e` passes.
