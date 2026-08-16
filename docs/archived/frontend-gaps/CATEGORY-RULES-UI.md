# Automatic Category Rules UI

> Audit date: 2026-07-16  
> Frontend status: **implemented 2026-07-17**  
> Backend status: **ready** — OpenAPI/generated-client coverage and create/delete idempotency are complete.

## 0. Outcome and acceptance gate

Give users a simple rule manager that maps a case-insensitive description substring to an existing category, so future CSV staged rows receive predictable category suggestions.

The acceptance demo is: create `SWIGGY → Food`, import a row whose description contains `swiggy`, see `Food` suggested, add a more specific `SWIGGY INSTAMART → Groceries` rule, verify the longest matching pattern wins, delete that rule, and verify future imports fall back to the broader rule.

## 1. Verified current state

- Runtime endpoints exist in `apps/api/src/category-rules/category-rule.controller.ts`.
- Shared schemas are in `packages/shared/src/category-rule.ts`.
- `suggestCategory()` performs case-insensitive substring matching and selects the longest match in `apps/api/src/category-rules/suggest-category.ts`.
- `ImportsService` applies rules to staged rows during parsing.
- Controller/service/matcher/integration tests exist.
- OpenAPI paths and generated client types now exist for category rules.
- No web feature, route, query key, list, create form, or delete action exists.

## 2. Backend contract

| Operation                            | Request                   | Response         |
| ------------------------------------ | ------------------------- | ---------------- |
| `GET /v1/category-rules`             | none                      | `CategoryRule[]` |
| `POST /v1/category-rules`            | `{ pattern, categoryId }` | `CategoryRule`   |
| `DELETE /v1/category-rules/{ruleId}` | path id                   | `204`            |

Rules contain a trimmed 1–80 character pattern, category id, user id, and timestamps. Creation verifies that the category belongs to the current user. Matching is substring-based, not regex, glob, word-boundary, or machine learning.

## 3. Completed backend prerequisites

Completed before frontend code:

1. Register category-rule schemas and all three paths in `apps/api/src/openapi/registry.ts`.
2. Include authenticated security, problem+json responses, path params, and response schemas.
3. Make POST and DELETE idempotent as required by `AGENTS.md`; repeated delete must return the original successful result rather than become a new failure.
4. Add/confirm five-attempt parallel integration coverage.
5. Run `pnpm gen:client` and commit the generated schema.

Do not call the runtime route with a hand-written `fetch` while waiting for OpenAPI.

## 4. Proposed route and feature slice

```text
apps/web/src/app/(app)/category-rules/page.tsx
apps/web/src/features/category-rules/
├── components/
│   ├── category-rule-list.tsx
│   ├── category-rule-row.tsx
│   ├── create-category-rule-form.tsx
│   └── delete-category-rule-dialog.tsx
├── hooks/
│   ├── use-category-rules.ts
│   ├── use-create-category-rule.ts
│   └── use-delete-category-rule.ts
├── server/get-category-rules.ts
└── index.ts
```

Link `Automatic categories` from `/more` and optionally from the categories page. Keep it separate from category CRUD because a rule is behavioral configuration, not a category.

## 5. Data flow

- Add `qk.categoryRules()` centrally.
- Server-render the initial rule list and hydrate the client query.
- Parse responses with `CategoryRuleSchema.array()`/`CategoryRuleSchema`.
- Resolve category names through `qk.categories()`; show `Unavailable category` safely if a rule references a category absent from the active list.
- Create/delete invalidates rules. Category archive also invalidates rules and import previews.
- Each mutation surface generates and reuses an idempotency UUID until confirmed success.

## 6. UX specification

### Rule list

- Each row reads like: `Description contains “SWIGGY” → Food`.
- Explain once that matching ignores letter case and the longest matching pattern wins.
- Sort exactly as returned or define/document backend ordering; do not make displayed order imply precedence because precedence is pattern length.
- Search/filter can be client-side only for the currently loaded complete list; no pagination exists.

### Create rule

- Fields: literal text pattern and active category.
- Explicit copy: `Plain text only—regular expressions are not supported.`
- Preview the sentence, not a fake match result.
- Validate with `CreateCategoryRuleSchema` and preserve input on failure.
- Archived categories are not selectable because the categories API returns active entries only.

### Delete rule

- Use `Delete rule`; rules are configuration and not ledger entries.
- Confirmation states that existing transactions/staged rows are unchanged and only future parsing suggestions change.
- Do not claim deletion retrains or recategorizes anything.

## 7. Edge cases and accessibility

- Duplicate or overlapping patterns: the backend contract does not publish uniqueness. Render every returned rule and explain longest-match behavior; add backend uniqueness semantics before blocking duplicates in UI.
- Equal-length matching rules have repository-order-dependent behavior. If deterministic precedence matters, add an explicit backend priority/tie-breaker before UI implementation.
- Pattern/category controls have accessible labels and error associations.
- Rule arrows have screen-reader text; color is not used as the only category cue.
- Empty state explains that imports still work but will have no automatic suggestions.

## 8. Tests

- Unit: rule sentence formatting and unavailable-category fallback.
- Component: empty/list/overlap states, literal-text copy, schema errors, delete confirmation.
- Hook: generated client only, idempotency key reuse, and query invalidation.
- Contract: OpenAPI generation includes all paths and tenancy probe coverage.
- E2E: create broad/specific rules, import matching rows, verify longest match, delete specific rule, import again, verify broad fallback.
- Backend: parallel duplicate writes/deletes and deterministic tie behavior if added.

## 9. Out of scope

- Regex, fuzzy, embedding, or AI categorization.
- Retroactive changes to posted transactions.
- Bulk rule import/export.
- Editing an existing rule; no update endpoint exists. Delete and recreate after idempotent APIs are ready.

## 10. Definition of done

- Routes are in OpenAPI and generated client.
- Mutations satisfy server-side idempotency requirements.
- UI copy matches literal substring/longest-match behavior exactly.
- Import suggestion E2E proves the feature's real downstream effect.
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm test:e2e` passes.
