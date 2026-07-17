# Category Management UI

> Audit date: 2026-07-16  
> Frontend status: **implemented 2026-07-17**  
> Backend status: **ready** — create/archive idempotency and parent-kind enforcement are complete and generated.

## 0. Outcome and acceptance gate

Create a settings feature for defining expense and income categories and archiving categories that should no longer appear in new transaction/import choices.

The feature is complete when a user can create a root or child category, optionally set its icon/color, immediately use it in quick-add and import review, and archive it without changing historical transactions.

## 1. Verified current state

- `GET /api/v1/categories`, `POST /api/v1/categories`, and `PATCH /api/v1/categories/:categoryId/archive` exist in `apps/api/src/categories/category.controller.ts`.
- The shared source of truth is `packages/shared/src/category.ts`.
- All three operations exist in OpenAPI and `apps/web/src/lib/api/generated/schema.d.ts`.
- The web app only reads categories for the quick-add selector and import staged-row selector.
- No category route, creation form, hierarchy view, style preview, or archive control exists.

## 2. Backend contract

| Operation                                   | Request          | Response     | UI purpose                    |
| ------------------------------------------- | ---------------- | ------------ | ----------------------------- |
| `GET /v1/categories`                        | none             | `Category[]` | Render active categories      |
| `POST /v1/categories`                       | `CreateCategory` | `Category`   | Create category               |
| `PATCH /v1/categories/{categoryId}/archive` | path id          | `204`        | Hide category from active use |

`CreateCategory` fields:

- `name`: trimmed, 1–80 characters.
- `kind`: `expense` or `income`.
- `parentId`: optional existing category id.
- `icon`: optional trimmed string, maximum 32 characters.
- `color`: optional six-digit hex color.

The API lists active categories only. Existing transactions can continue referencing an archived category id, but the frontend cannot currently retrieve the archived category record after archive. The UI must not promise a historical category-management view without an expanded read contract.

## 3. Completed backend prerequisite

Category create/archive now implement the `Idempotency-Key` rule; repeated archive replays the original success. The completed gate includes:

1. Make create and archive response-idempotent.
2. Add their idempotency headers/replay semantics to OpenAPI.
3. Run `pnpm gen:client`.
4. Add concurrency integration tests with at least five identical attempts.

The frontend must not use disabled buttons as its only duplicate-write protection.

## 4. Proposed route and feature slice

```text
apps/web/src/app/(app)/categories/page.tsx
apps/web/src/features/categories/
├── components/
│   ├── category-list.tsx
│   ├── category-row.tsx
│   ├── create-category-form.tsx
│   └── archive-category-dialog.tsx
├── hooks/
│   ├── use-categories.ts
│   ├── use-create-category.ts
│   └── use-archive-category.ts
├── model/category-tree.ts
├── server/get-categories.ts
└── index.ts
```

Move or re-export the existing category query from `features/quick-add` so all consumers use `features/categories` through its `index.ts`.

Link `Categories` from `/more`; keep the primary five-item navigation unchanged.

## 5. Data flow

- Continue using `qk.categories()` as the single list key.
- Server-render the initial list and hydrate the query hook with it.
- Parse responses with `CategorySchema.array()` at the runtime boundary.
- Derive the parent/child tree in a pure function; do not define a duplicate category shape.
- On create/archive, invalidate categories, transaction queries that display category names, import previews, and category-rule queries.
- Each mounted mutation surface owns one idempotency key and retains it until success.

## 6. UX specification

### List

- Separate `Expense` and `Income` sections so kind is never conveyed by color alone.
- Render root categories followed by indented children.
- Show icon and color when present, but always show text labels.
- If a `parentId` cannot be resolved from the active response, render the category at root with a non-blocking diagnostic; never crash or cast.

### Create form

- Fields: kind, name, optional parent, optional icon, optional color.
- Parent options must match the selected kind. The backend now enforces parent-kind equality; the UI filters options for guidance but does not replace server validation.
- Use native color input only as an enhancement and retain a text value validated by `CreateCategorySchema`.
- Preserve the form on network failure and map validation pointers to fields.

### Archive flow

- Use `Archive category`, not `Delete category`.
- Explain that historical transactions are unchanged and the category disappears from future selectors.
- If rules reference the category, the current API does not expose dependency information. Do not claim rules will be removed or migrated. Add a backend dependency response before implementing such behavior.

## 7. Error, accessibility, and mobile behavior

- Loading skeletons preserve both section headings.
- Empty state offers `Create expense category` and `Create income category` actions.
- Color swatches include visible names/hex values and sufficient borders in both themes.
- Parent indentation is accompanied by accessible hierarchy semantics or explicit `Child of …` text.
- Form controls and archive actions meet the 44 px touch target.

## 8. Tests

- Unit: tree construction, missing-parent fallback, and parent filtering by kind.
- Component: expense/income sections, nested categories, optional icon/color, create validation, archive confirmation.
- Hook: generated client usage, idempotency header reuse, and invalidation of categories/import previews/rules.
- Integration/E2E: create category, use it in quick-add, archive it, verify it leaves active selectors while the posted transaction remains intact.
- Backend prerequisite: parallel duplicate create/archive attempts produce one effect.

## 9. Out of scope

- Rename or restyle existing categories; no update endpoint exists.
- Unarchive or hard-delete.
- Reassigning historical transactions during archive.
- Rule management; that is specified in `CATEGORY-RULES-UI.md`.

## 10. Definition of done

- Backend idempotency prerequisite is closed.
- All request/response types come from shared schemas/generated client.
- No raw query values are spread into requests.
- Existing quick-add and import category selectors consume the shared feature query.
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm test:e2e` passes.
