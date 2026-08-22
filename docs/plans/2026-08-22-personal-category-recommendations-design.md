# Personal category recommendations — implementation specification

**Status:** Proposed implementation plan

**Audience:** Backend, web, data-quality, and test implementers

**Primary goal:** Make repetitive category assignment fast without silently changing ledger data

**Authoritative constraints:** `AGENTS.md`, generated OpenAPI client, deterministic private history, and existing category semantics

## 1. Executive decision

Add a reusable, searchable category picker that places up to five private,
deterministic recommendations above the complete eligible category list.
Recommendations are computed from the signed-in user's own rules and prior
accepted transaction categories. They are suggestions only: opening the picker,
loading a result, or changing the description must never assign a category.

The implementation extends the existing category-suggestion engine used by CSV
imports. It must not introduce a second matcher, a global popularity model, an
LLM, embeddings, or an external service.

The first release covers:

- quick add;
- the transactions-page **New entry** drawer;
- transaction-detail category editing in both the drawer and dedicated page;
- expense and income categories; and
- explicit reasons such as **Rule match**, **Used for similar entries**,
  **Frequently used**, and **Recently used**.

The existing import-preview suggestion flow stays intact. It continues to use
the single-result `CategorySuggestionSchema`; the new picker API composes that
contextual winner with frequent/recent fillers.

## 2. Why this feature exists

The current web UI renders a flat `Select` in four transaction surfaces. That
works for a small category list, but it makes common choices cost the same as
rare ones and provides no search, hierarchy, reason, or personal ordering.

Global “most used” categories are not a useful shortcut. A person's repeated
choices are specific: one user may repeatedly need Metro, Office lunch, and SIP,
while another needs Fuel, School, and Rent. Cross-user aggregation would also
create unnecessary privacy, explainability, tenancy, and cold-start concerns.

The product decision is therefore:

> “Most used” always means most used by this user, for this transaction type,
> before this transaction's effective time.

## 3. Success criteria

The feature is complete when all of the following are true:

1. A user can reach a likely category with one picker open and one selection.
2. The complete active category list remains searchable and selectable.
3. No category is assigned until the user explicitly selects one and saves.
4. Expense requests never return income categories, and vice versa.
5. Recommendations are deterministic for the same user, input, and history.
6. Low-evidence or ambiguous descriptions do not receive a contextual claim.
7. Recommendation loading and failure never block category selection or save.
8. A late response never overwrites a user's current type, input, or selection.
9. Raw descriptions, merchant text, category names, and user identifiers never
   appear in logs, metric labels, analytics payloads, or URLs.
10. Existing imports produce the same suggestion results unless a deliberately
    versioned algorithm change is separately evaluated and approved.

## 4. Non-goals

The first release does not:

- auto-categorize a transaction;
- modify a category after save;
- create a category rule silently;
- learn from picker impressions or hover state;
- aggregate behavior across users;
- use a model, vector database, or third-party classification API;
- recommend archived categories;
- redesign the import review table;
- recommend an asset-funded expense as consumption after asset funding exists;
- persist recommendation responses; or
- claim that a frequent shortcut is a high-confidence prediction.

## 5. Current codebase baseline

Implementation must build on the following existing seams rather than bypass
them.

| Concern               | Existing source                                                 | Required use                                                          |
| --------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------- |
| Shared provenance     | `packages/shared/src/category-suggestion.ts`                    | Preserve the import-facing suggestion contract                        |
| Deterministic ranking | `apps/api/src/category-rules/category-suggestion-ranking.ts`    | Reuse rule, exact-counterparty, and approximate stages                |
| Bounded history       | `apps/api/src/category-rules/category-suggestion.repository.ts` | Keep tenant, type, time, status, lookback, and row bounds             |
| Orchestration         | `apps/api/src/category-rules/category-suggestion.service.ts`    | Add picker recommendation composition here                            |
| Active categories     | `apps/api/src/categories/category.repository.ts`                | Filter by user, kind, and archive state                               |
| OpenAPI               | `apps/api/src/openapi/registry.ts`                              | Register the route and regenerate the client                          |
| Category reads        | `apps/web/src/features/categories/hooks/use-categories.ts`      | Continue loading complete picker choices from the category endpoint   |
| Query keys            | `apps/web/src/lib/query/keys.ts`                                | Add a stable recommendation key factory                               |
| Existing controls     | `apps/web/src/components/ui/select/select.tsx`                  | Do not overload generic `Select`; create a category-specific combobox |
| Create surfaces       | quick add and `create-txn-sheet.tsx`                            | Replace flat category selects                                         |
| Edit surfaces         | `txn-detail-drawer.tsx` and `txn-detail.tsx`                    | Replace duplicated flat category selectors                            |
| Category visuals      | icon registry, `IconGlyph`, `glyphFor`, and palette helpers     | Reuse icon/color language                                             |
| Import behavior       | `apps/api/src/imports/imports.service.ts` and import review UI  | Preserve single-suggestion behavior                                   |

### 5.1 Existing algorithm contract

The current engine already provides important guarantees:

- explicit rules win before learned history;
- exact counterparties require at least three examples, at least 80% category
  share, and a lead of at least two examples;
- approximate stages use calibrated thresholds;
- history is capped at 500 rows over a 3,660-day lookback;
- history is strictly earlier than the target `occurredAt`;
- only posted, categorized, non-reversed transactions are read; and
- ranking uses stable tie-breakers.

Do not weaken those thresholds merely to ensure that every description returns
a result. Abstention is a correct result.

## 6. Terminology

- **Contextual recommendation:** a rule or calibrated description-history
  match that claims relevance to the current narration.
- **Shortcut recommendation:** a frequent or recent category shown for speed,
  without a confidence claim.
- **Eligible category:** active, owned by the current user, and of the requested
  expense/income kind.
- **Target:** the unsaved or edited transaction context sent to the query.
- **Manual selection:** any selection made by the user from a recommendation or
  the complete list. Both are explicit choices.
- **Abstention:** no contextual recommendation because evidence is absent,
  weak, ambiguous, ineligible, or outside the resource budget.

## 7. Product behavior

### 7.1 Picker information architecture

The category control becomes a category-specific combobox/popover:

```text
┌ Category ─────────────────────────────────────┐
│  Groceries                                  ▾ │
└───────────────────────────────────────────────┘

┌───────────────────────────────────────────────┐
│  Search categories…                           │
│                                               │
│  RECOMMENDED FOR YOU                          │
│  [ 🛒 Groceries ]  [ 🍽 Dining ]               │
│    Similar entries     Frequently used        │
│                                               │
│  ALL EXPENSE CATEGORIES                       │
│  ○ Uncategorized                              │
│  🧾 Bills & utilities                         │
│  🍽 Dining                                    │
│  🛒 Groceries                                 │
│  …                                            │
└───────────────────────────────────────────────┘
```

The recommended area is compact and visually secondary to the actual field
value. It is not a promotional card and does not use a confidence meter. The
product should feel faster, not “AI-powered.”

### 7.2 Create-flow field order

Move **Description** before **Category** in quick add and the new-entry drawer.
The description is the contextual signal, so asking for it after category
selection makes the recommendation arrive too late. Preserve the surrounding
form layout, amount behavior, account selection, date picker, tags, and sticky
save action.

Recommended order:

1. Expense / Income
2. Amount
3. Account
4. Description
5. Category
6. Date and time
7. Tags
8. Save

The generic frequent/recent recommendations are available as soon as the picker
opens. Description-aware results refine them after the debounce.

### 7.3 Quick add and new-entry drawer

- The trigger displays the selected category icon, color, and name.
- With no selection it displays **Uncategorized**.
- Opening immediately shows locally available categories and begins the generic
  recommendation query.
- A non-empty description begins a debounced contextual query.
- Clicking a recommendation calls the same `onChange(categoryId)` path as
  clicking a category in the full list.
- Saving uses the existing transaction schema and idempotency key; no
  recommendation metadata is added to the transaction mutation.
- After a successful save, form reset clears the selection and query context.

### 7.4 Transaction detail editing

Transaction type and occurrence time are immutable, so the editor passes those
existing values to the picker. Description edits may refresh recommendations,
but an arriving result must never alter the selected category.

If the user edits description and category together, the existing
`UpdateTransactionSchema` request remains the only mutation. No recommendation
feedback write is coupled to that request.

### 7.5 Changing transaction type

On create surfaces:

1. Clear an existing category if it is not eligible for the new type.
2. Close the popover or reset its active option.
3. Render the complete category list for the new type immediately.
4. Start a recommendation query for the new type.
5. Ignore any response keyed to the previous type.

Never retain an expense category in an income form, even briefly in the request
payload.

### 7.6 Search

Search is local over the already-loaded active categories. It does not call a
new endpoint.

Normalize search with NFKC, trim, lowercase, and collapsed whitespace. Match:

- category name;
- parent category name, when present; and
- no raw internal id.

When search is non-empty, keep recommended choices visible only if they match
the search. This avoids two competing result sets. Display **No matching
categories** with a clear-search action when nothing matches.

### 7.7 Category hierarchy

The current category model supports one parent relation. The picker should show
children under their parent without changing stored category ids:

```text
Food
  Dining
  Groceries
Travel
  Metro
  Flights
Uncategorized
```

If a parent itself is selectable today, keep it selectable. Grouping is visual,
not a schema change. Orphaned children fall back to the top level rather than
disappearing.

### 7.8 Empty and failure states

| State                   | Picker behavior                                                             |
| ----------------------- | --------------------------------------------------------------------------- |
| Categories loading      | Disabled trigger only when no initial category data exists                  |
| No eligible categories  | Show Uncategorized and a link to manage categories                          |
| Recommendations loading | Show a two-row skeleton only in the recommended area                        |
| No recommendations      | Omit the recommended heading; show the full list normally                   |
| Recommendation error    | Omit recommendations; keep search and all categories usable                 |
| Categories error        | Show an inline retry and keep the current selected label if known           |
| Stale current selection | Show the archived/unavailable selection as selected but do not recommend it |

Recommendation failure does not produce a toast. It is an optional enhancement,
not a failed financial operation.

## 8. Recommendation contract

### 8.1 Shared request schema

Add a new shared file such as
`packages/shared/src/category-recommendation.ts` and export it from the shared
barrel.

```ts
export const CategoryRecommendationQuerySchema = z.object({
  type: CategoryKindSchema,
  description: z.string().trim().min(1).max(500).optional(),
  occurredAt: z.string().datetime({ offset: false }),
  limit: z.number().int().min(1).max(5).default(5)
});
```

Rules:

- `description` is optional rather than an empty required string. The web omits
  it when its trimmed draft is blank; a supplied blank string is rejected.
- The server trims it at the runtime boundary.
- `occurredAt` is an ISO 8601 UTC date-time ending in `Z`; date-only values and
  local date-times without a UTC designator are rejected. The controller parses
  it to `Date` exactly once before calling in-process ranking code. Requiring
  the instant also prevents backdated entries from learning from their future.
- `limit` is bounded to 1–5 and defaults to 5.
- The request never accepts `userId`; tenancy comes from `@CurrentUser()`.

### 8.2 Item schema

```ts
export const CategoryRecommendationReasonSchema = z.enum([
  "explicit_rule",
  "exact_counterparty",
  "similar_description",
  "frequent",
  "recent"
]);

export const CategoryRecommendationSchema = z.object({
  categoryId: CategoryIdSchema,
  reason: CategoryRecommendationReasonSchema,
  evidenceCount: z.number().int().positive(),
  confidenceBps: z.number().int().min(0).max(10_000).optional(),
  algorithmVersion: z.number().int().positive()
});
```

`confidenceBps` is returned only for rule/contextual matches. Frequent and
recent shortcuts have evidence counts but no confidence because frequency is
not predictive certainty.

The service maps existing methods as follows:

| Existing method                          | Picker reason         |
| ---------------------------------------- | --------------------- |
| `explicit_rule`                          | `explicit_rule`       |
| `exact_counterparty`                     | `exact_counterparty`  |
| `jaro_winkler`, `soft_tf_idf`, `jaccard` | `similar_description` |

Do not change `CategorySuggestionSchema` or its method enum in this work. That
contract remains the precise import provenance record.

### 8.3 Response schema

Use a concrete calculated-result envelope rather than returning a bare array:

```ts
export const CategoryRecommendationResponseSchema = z.object({
  items: z.array(CategoryRecommendationSchema).max(5),
  computedAt: z.coerce.date(),
  sourceThrough: z.coerce.date().nullable(),
  algorithmVersion: z.number().int().positive(),
  historyRowsConsidered: z.number().int().min(0).max(500),
  degraded: z.boolean()
});
```

- `sourceThrough` is the newest eligible history timestamp considered, or
  `null` with no history.
- `historyRowsConsidered` is safe aggregate evidence; it reveals no narration.
- `degraded` is true when contextual work was skipped because its time budget
  was exhausted. Frequent/recent shortcuts may still be returned.
- Items never include category names. The web resolves display data from its
  category list so renamed categories remain consistent.

## 9. Ranking policy

### 9.1 Ordered cascade

Return no more than the requested limit. Deduplicate by `categoryId`, keeping
the earliest/highest-priority occurrence.

1. **Explicit user rule** — reuse longest matching substring logic.
2. **Calibrated personal context** — reuse the current exact-counterparty and
   active approximate stages. This contributes at most one item.
3. **Frequent personal choices** — aggregate eligible history per category and
   order by usage count descending, most-recent use descending, then category
   id ascending.
4. **Recent distinct choices** — scan eligible history newest first and fill
   remaining slots with categories not already emitted.

This is a cascade, not a blended floating-point score. A lexicographic policy
is easier to reproduce, explain, and test, and it does not invent an arbitrary
weight between frequency and recency.

When a category qualifies in more than one stage, retain the reason,
`evidenceCount`, and optional `confidenceBps` from the earliest stage only. Do
not merge counts or average confidence across semantically different stages.

### 9.2 Exact tie-breakers

Frequent categories use this comparator:

```text
1. usageCount descending
2. latestOccurredAt descending
3. latestTransactionId ascending
4. categoryId ascending
```

Recent fillers use the history repository order:

```text
1. occurredAt descending
2. transactionId descending (matching the bounded query)
3. first distinct category wins
```

All dates compare epoch milliseconds. Category ids are compared with
`localeCompare` exactly as the existing ranking code does.

### 9.3 Evidence rules

- A frequent result needs at least two eligible uses. A one-off choice belongs
  only in the recent filler stage.
- `evidenceCount` for frequent is the bounded-window usage count.
- `evidenceCount` for recent is the count of that category in the bounded
  history, even though its position is determined by the latest occurrence.
- Description absent or normalized to no meaningful text skips contextual
  stages without marking the response degraded.
- A contextual ambiguity remains an abstention; do not fall through to a
  different approximate stage after `exactCounterpartySuggestion` reports a
  matched-but-ambiguous counterparty, preserving current behavior.

### 9.4 Eligibility

Every candidate must satisfy all of these rules:

- same `userId`;
- same transaction type;
- category is active at query time;
- transaction status is `posted`;
- `categoryId` is present;
- no `reversalOf` and no `reversedBy`;
- `occurredAt < target.occurredAt`;
- within the 3,660-day lookback;
- within the first 500 ordered history rows; and
- once asset funding exists, transaction is not an active asset-funded
  consumption outflow.

The asset-funding filter must be introduced only after that table exists. Keep
this PR independently implementable by documenting the future join and adding a
follow-up checklist item rather than referencing a nonexistent table in code.

### 9.5 Resource behavior

Preserve the current resource contract:

```text
lookbackDays: 3660
maxRows:      500
timeoutMs:    5000
```

For the interactive endpoint, start independent category, rule, and history
reads together where module boundaries allow. Never issue one history query per
candidate category. If the contextual budget is reached, skip approximate
matching and still construct deterministic frequent/recent fillers from the
already-prepared history.

## 10. API design

### 10.1 Route

```http
POST /api/v1/category-recommendations/query
Content-Type: application/json
```

A POST is intentional even though this is a read. Descriptions can contain
merchant and payment narration and must not appear in URLs, proxy query logs,
browser history, or referrer data.

No `Idempotency-Key` is required because the operation has no side effects.
Global authentication, tenancy, RFC 7807 error handling, and rate limiting
still apply.

### 10.2 Controller

Add a focused `CategoryRecommendationController` in `CategoryRulesModule`:

1. Parse `unknown` body with `CategoryRecommendationQuerySchema`.
2. Read `user.id` from `@CurrentUser()`.
3. Call exactly one `CategorySuggestionService.recommendForPicker` method.
4. Return `CategoryRecommendationResponse`.

The controller contains no ranking, Drizzle access, logging of the body, or
category-name hydration.

The parsed controller input converts `occurredAt` from its validated UTC string
to `Date` once. Repository and ranking layers receive the derived in-process
type; they do not repeatedly parse or assert request data.

### 10.3 Service changes

Keep `suggestMany` behavior stable for imports. Add a second public method:

```ts
recommendForPicker(
  userId: string,
  input: CategoryRecommendationQuery
): Promise<CategoryRecommendationResponse>
```

Suggested internal decomposition:

- `loadEligibleRecommendationContext(...)`
- existing `prepareCategorySuggestionHistory(...)`
- existing `rankCategorySuggestions(...)`
- new pure `rankFrequentCategories(...)`
- new pure `fillRecentCategories(...)`
- new pure `composeCategoryRecommendations(...)`

Pure ranking helpers belong in
`category-suggestion-ranking.ts` or a narrowly named sibling and receive
prepared inputs; they do not call repositories.

### 10.4 Repository changes

The current history query already selects exactly the fields needed for
frequency and recency. Do not add a usage-counter table for the first release.

If a source-through timestamp or precise row count is needed, derive it from
the returned bounded rows. Do not run separate count/max queries.

### 10.5 OpenAPI and generated client

Register the route in `apps/api/src/openapi/registry.ts` with:

- authenticated security;
- JSON request body schema;
- 200 response schema;
- standard 400/401/429 problem responses; and
- a description stating that the route has no side effects.

Run `pnpm gen:client` and consume only the generated path from the web. No
hand-written `fetch` or local duplicate API type is allowed.

## 11. Frontend architecture

### 11.1 Component boundary

Create a feature component, not a generic UI primitive:

```text
apps/web/src/features/categories/components/category-picker/
  category-picker.tsx
  category-picker-list.tsx
  category-recommendation-chips.tsx
  category-picker.test.tsx
```

The public component contract should remain presentation-focused:

```ts
type CategoryPickerProps = Readonly<{
  categories: readonly Category[];
  type: CategoryKind;
  value: string | undefined;
  onChange: (categoryId: string | undefined) => void;
  description?: string;
  occurredAt: Date;
  disabled?: boolean;
  allowUncategorized?: boolean;
  label?: string;
}>;
```

The picker owns open/search/focus state. The parent form remains the owner of
the selected category.

### 11.2 Query hook

Add `useCategoryRecommendations` under the categories feature. It should:

- use the generated client;
- parse the response with the shared Zod schema;
- be enabled only while the picker is open;
- debounce description-aware input by 250–300 ms;
- key by type, normalized description, occurredAt ISO value, and limit;
- use a short stale time (for example 60 seconds) because unsaved form context
  can repeat during one session;
- keep previous generic results while contextual results load;
- avoid retries for 4xx errors; and
- convert network/problem responses through existing error helpers.

Do not put the raw description in a URL or analytics event. An in-memory React
Query key is acceptable, but it must never be logged or persisted.

Recommendation cache data must not survive an identity change. Use the app's
authenticated session transition to clear the complete React Query cache on
sign-out (preferred because every tenant-scoped query needs the same
protection), or include the stable session user id as an internal first query
key segment and remove that scope on sign-out. Never accept the identity scope
from recommendation request input.

### 11.3 Manual-selection invariant

Recommendation data must be treated as render input only. No effect may call
`onChange` when recommendations arrive.

The following race must be safe:

```text
T0 user opens picker for expense / "SWIGGY"
T1 request A starts
T2 user selects Dining manually
T3 user changes description to "UBER"
T4 request A resolves with Groceries
T5 request B resolves with Transport

Final selected value: Dining
```

React Query's keyed result handles response identity; controlled form state
handles selection identity. Do not add an effect that synchronizes the two.

### 11.4 Client boundaries and performance

All affected forms are already client components. Keep the new interactivity at
the category picker leaf. Do not convert route pages or server loaders to client
components.

Performance rules:

- build the eligible-category map once with `useMemo` when inputs change;
- do not repeatedly scan category arrays for every rendered recommendation;
- render at most five recommendation chips;
- avoid a new global event listener per picker instance when closed;
- load no new UI dependency;
- keep category visuals on existing Lucide/icon helpers; and
- use CSS transitions already defined in the design system, respecting
  `motion-reduce`.

### 11.5 Query invalidation

Recommendation results derive from transactions, category rules, and category
availability.

Invalidate the recommendation root after:

- a successful transaction create or category-changing update;
- category archive/unarchive/delete;
- category rule create/delete; and
- a successful import commit that posts categorized rows.

Do not invalidate on picker open, search text change, or selection before save.

## 12. Visual design contract

The feature should extend the app's current visual language: compact financial
tooling, Inter Tight, mono utility labels, emerald accent, category-specific
icon/color, elevated white/black surfaces, and restrained motion.

### 12.1 Signature interaction

The memorable element is a short “category rail” of personal choices directly
above the complete list. Each recommendation combines the existing category
medallion with one plain-language reason. This is specific to the user's ledger
history and avoids a generic sparkle/AI treatment.

### 12.2 Recommendation chip anatomy

```text
┌──────────────────────────┐
│ [icon] Groceries         │
│        Similar entries   │
└──────────────────────────┘
```

- 44 px minimum interactive height;
- category color appears in the icon medallion, not as the only status signal;
- category name uses normal sentence case;
- reason uses muted text and no raw count by default;
- selected chip uses the same checkmark/selected state as a full-list option;
- hover/focus does not shift layout; and
- no confidence percentage is shown in the normal picker.

Counts may be included in an accessible description, for example “Frequently
used, 12 prior entries,” without cluttering every chip.

### 12.3 Copy mapping

| Reason                | Visible copy    | Accessible detail                                  |
| --------------------- | --------------- | -------------------------------------------------- |
| `explicit_rule`       | Rule match      | “Recommended by one of your category rules”        |
| `exact_counterparty`  | Same merchant   | “Used for this merchant in N prior entries”        |
| `similar_description` | Similar entries | “Used for similar descriptions in N prior entries” |
| `frequent`            | Frequently used | “Used in N prior entries”                          |
| `recent`              | Recently used   | “One of your recent category choices”              |

Do not say “smart,” “AI,” “learned you,” or “best match.”

## 13. Accessibility and keyboard contract

Implement the control as an accessible combobox/listbox pattern. At minimum:

- trigger has `role="combobox"`, `aria-expanded`, and `aria-controls`;
- search input has an explicit accessible name;
- recommendation and full-list choices are keyboard reachable;
- Arrow Up/Down moves one active option across both sections;
- Home/End moves to first/last enabled option;
- Enter or Space selects;
- Escape closes and returns focus to the trigger;
- Tab closes without trapping focus;
- selected option uses `aria-selected="true"`;
- disabled/unavailable items are not focus targets;
- reasons are announced without category color dependence;
- a loading region uses `aria-live="polite"` without announcing every
  keystroke; and
- focus rings use the existing accent tokens.

The picker must work at 320 px width, 200% zoom, high contrast, dark mode, and
with reduced motion. Recommendation chips may wrap; they must not introduce
horizontal page scroll.

## 14. Privacy, security, and observability

### 14.1 Privacy rules

- Query only the authenticated user's rows.
- Never accept `userId` from request data.
- Never log request bodies or normalized descriptions.
- Never use category names, ids, descriptions, merchant keys, or user ids as
  metric labels.
- Never persist the response or picker impression.
- Never send narration to an external service.

Before shipping, verify privacy at every request-observation layer:

- Pino HTTP serializers do not include `req.body`; add an explicit redaction
  path for the recommendation body's `description` as defense in depth.
- nginx/NPMplus access logs record method, route, status, and duration only;
  request bodies remain disabled.
- APM/error reporting does not capture POST bodies for this route; add a route
  scrubber if body capture is globally enabled.
- test and staging request loggers follow the same redaction behavior as
  production.
- captured exception metadata includes only the aggregate outcome and request
  id, never the parsed description or normalized counterparty.

### 14.2 Safe metrics

Backend aggregate counters may include:

- request outcome: `contextual`, `shortcut_only`, `empty`, `degraded`;
- contextual method family;
- result-count bucket;
- duration bucket; and
- history-row-count bucket.

Client acceptance analytics are out of scope unless the repository gains an
approved, privacy-reviewed first-party analytics path. Do not add an ad hoc
feedback endpoint merely for this feature.

### 14.3 Failure handling

| Failure                           | Behavior                                                              |
| --------------------------------- | --------------------------------------------------------------------- |
| Category query fails              | RFC 7807 response; picker falls back to full list                     |
| History query times out           | Return shortcut-only or empty response with `degraded: true`          |
| Category archived during request  | Filter again before response; web also drops ids not in active list   |
| User switches type during request | Old keyed result is not rendered                                      |
| Category deleted after render     | Transaction mutation performs canonical validation and rejects safely |

## 15. ADR summary

### ADR-CR-001: Extend the deterministic suggestion engine

**Status:** Proposed

**Decision:** Reuse `CategorySuggestionService` and its pure ranking functions.

**Alternatives considered:** a separate picker engine, global popularity,
client-only ranking, and an LLM.

**Trade-off:** Reusing a bounded 500-row history is not a perfect lifetime
frequency table, but it avoids new mutable aggregates and guarantees that
imports and interactive recommendations share calibrated behavior.

### ADR-CR-002: Use POST for the read query

**Status:** Proposed

**Decision:** Send narration in a POST body.

**Trade-off:** POST is less naturally cacheable by HTTP intermediaries, but
React Query supplies safe session caching and narration stays out of URLs and
proxy query logs.

### ADR-CR-003: Keep selection fully explicit

**Status:** Proposed

**Decision:** Results render options and never mutate form state.

**Trade-off:** Users still make one selection, but ledger meaning remains under
their control and async races cannot silently categorize transactions.

### ADR-CR-004: Use a cascade instead of a blended score

**Status:** Proposed

**Decision:** Rule/context winner, then frequent, then recent.

**Trade-off:** A cascade is less statistically flexible than a learned ranker,
but is deterministic, explainable, chronologically testable, and easy to
version.

## 16. Implementation plan by slice

Each slice should be a reviewable commit or small PR. Do not combine migration,
unrelated UI standardization, or asset funding work with this feature.

### Slice 1 — Shared contracts and pure ranking

Files:

- add `packages/shared/src/category-recommendation.ts`;
- update `packages/shared/src/index.ts`;
- extend `category-suggestion-ranking.ts`; and
- add/extend shared and ranking tests.

Work:

1. Define request, item, reason, and response schemas.
2. Add pure frequent aggregation and recent-fill helpers.
3. Add the composition function with strict deduplication and limit handling.
4. Preserve current `rankCategorySuggestions` output for import fixtures.
5. Define `CATEGORY_RECOMMENDATION_ALGORITHM_VERSION = 2` for the new cascade;
   do not silently relabel or change import suggestion algorithm version 1.

Acceptance:

- deterministic output regardless of input array object identity;
- no duplicate ids;
- no more than five results; and
- all shared schema tests pass.

### Slice 2 — Backend query endpoint

Files:

- `category-suggestion.service.ts`;
- optionally a focused recommendation controller;
- `category-rules.module.ts`;
- `openapi/registry.ts`; and
- backend unit/controller tests.

Work:

1. Load active categories, rules, and one bounded history window.
2. Filter eligibility before ranking.
3. Compose contextual and shortcut items.
4. Return metadata without raw narration.
5. Register OpenAPI and verify the tenancy probe discovers the authenticated
   route.

Acceptance:

- response is read-only;
- type and tenancy filters are enforced in repositories/services;
- no N+1 query per category; and
- errors use global problem+json mapping.

### Slice 3 — Generated client and reusable picker

Files:

- regenerated web API schema;
- query keys;
- `use-category-recommendations.ts`;
- category picker component files; and
- focused component/hook tests.

Work:

1. Implement local search, grouped full list, recommendation rail, and states.
2. Implement debounce and query enablement.
3. Reuse category icon/color helpers.
4. Verify manual selection survives refreshes and request races.
5. Verify keyboard and screen-reader attributes.

Acceptance:

- picker is usable with recommendation API unavailable;
- no new dependency;
- no raw `fetch`; and
- no form mutation from recommendation effects.

### Slice 4 — Integrate all transaction surfaces

Files:

- quick add form;
- create transaction sheet;
- transaction detail drawer;
- transaction detail page; and
- their tests.

Work:

1. Move description before category on create forms.
2. Replace four category `Select` instances.
3. Pass type, description, and effective date.
4. Preserve idempotency-key lifecycle and existing validation mapping.
5. Add recommendation-root invalidation after successful category-changing
   writes.

Acceptance:

- every surface behaves consistently;
- type change clears only incompatible categories;
- saving without a category remains supported; and
- a recommendation failure never blocks posting.

### Slice 5 — Evaluation and optional rule conversion

This slice is optional and must not block the core feature.

1. Add a chronological offline fixture evaluation for picker composition.
2. Compare coverage and ambiguity without tuning against future rows.
3. Only after evidence supports it, offer **Create rule from this choice** after
   repeated same-merchant corrections.
4. Rule creation remains an explicit existing category-rule mutation with its
   own idempotency key and confirmation UI.

Do not create a rule merely because a user clicked a recommendation.

## 17. File-level implementation map

| File or area                                     | Expected change                                                 |
| ------------------------------------------------ | --------------------------------------------------------------- |
| `packages/shared/src/category-recommendation.ts` | New picker request/response contracts                           |
| `packages/shared/src/category-suggestion.ts`     | No breaking changes                                             |
| `category-suggestion-ranking.ts`                 | Pure frequent/recent composition                                |
| `category-suggestion.repository.ts`              | Reuse existing bounded query; later add asset-funding exclusion |
| `category-suggestion.service.ts`                 | New interactive orchestration; preserve imports                 |
| `category-recommendation.controller.ts`          | New tenant-scoped POST read route                               |
| `category-rules.module.ts`                       | Register controller; existing providers remain                  |
| `openapi/registry.ts`                            | Route, request, response, and errors                            |
| generated web schema                             | Regenerated from OpenAPI                                        |
| `query/keys.ts`                                  | Recommendation root and contextual key                          |
| categories hooks                                 | Query hook and invalidation helpers                             |
| category picker component                        | Search, recommendations, hierarchy, keyboard UX                 |
| quick add / new-entry sheet                      | Field reorder and picker integration                            |
| both transaction detail editors                  | Picker integration                                              |
| import service/UI                                | No behavior change; regression coverage only                    |

## 18. Required test matrix

### 18.1 Pure ranking tests

- explicit rule is first and appears once;
- exact counterparty is ahead of frequent shortcuts;
- approximate match maps to `similar_description`;
- ambiguous exact counterparty abstains contextually;
- frequent sort uses count, recency, transaction id, then category id;
- recent fill uses distinct newest categories;
- one-use categories do not enter the frequent stage;
- limit 1 and limit 5 are honored;
- duplicate categories across stages keep the highest-priority reason;
- blank/whitespace description skips contextual work;
- history at the exact target timestamp is excluded;
- algorithm output is stable across repeated runs; and
- existing import-ranking fixtures are unchanged.

### 18.2 Repository/service tests

- expense never returns income history or categories;
- archived, reversed, reversal, uncategorized, and cross-tenant rows are
  excluded;
- future history is excluded for backdated targets;
- history query never exceeds 500 rows or 3,660 days;
- no history returns an empty result, not an error;
- contextual timeout returns `degraded: true` without raw data;
- contextual timeout still returns deterministic frequent/recent fillers when
  prepared history is available;
- inactive ids returned by an in-flight history query are filtered before the
  response; and
- recommendation query performs no insert, update, audit, or rule creation.

### 18.3 Controller/OpenAPI tests

- unauthenticated request is rejected;
- malformed type/date/limit/description produces RFC 7807 validation output;
- valid UTC ISO date-time is parsed once, while date-only, offset-free, invalid,
  and out-of-range request fields are rejected;
- `userId` in an unexpected body field is rejected or stripped by the chosen
  strict schema policy and is never honored;
- route appears in generated OpenAPI and tenancy probes;
- response parses with the shared schema; and
- narration does not appear in captured logs.

### 18.4 Frontend hook tests

- no request while picker is closed;
- generic request on open;
- description request after debounce;
- previous request result is not rendered for a changed type/key;
- superseded requests are cancelled when supported, and a captured-key check
  prevents an out-of-order response from being applied;
- logout/login clears or identity-isolates recommendation cache entries so one
  account can never render another account's cached items;
- 4xx does not retry indefinitely;
- network failure returns a usable fallback state; and
- response Zod failure becomes an app error rather than unsafe rendering;
- successful transaction/category/rule writes invalidate the recommendation
  root, while a failed save leaves the prior cache intact; and
- a degraded contextual response retains available frequent shortcuts.

### 18.5 Picker component tests

- recommendation click selects exactly once;
- full-list click uses the same callback;
- recommendation arrival does not select;
- manual selection survives generic and contextual refreshes;
- search filters recommendations and full list;
- Uncategorized remains selectable when allowed;
- archived current selection is visible but not recommended;
- hierarchy and orphan fallback render correctly;
- Arrow keys, Home, End, Enter, Escape, and Tab behave correctly;
- trigger receives restored focus after close;
- accessible reason text is present;
- loading/error/empty states do not block full-list selection; and
- narrow viewport does not overflow.

### 18.6 Integration tests

- select a recommendation and post: exactly one normal transaction exists with
  the chosen category;
- display recommendations and post without selecting: transaction remains
  uncategorized;
- change Expense to Income after an expense selection: incompatible category
  is absent from the payload;
- edit description while a request is pending: later response does not replace
  manual selection; and
- category rule creation/deletion changes later recommendations only after the
  explicit rule mutation succeeds.

## 19. Verification commands

Run the full repository definition of done after implementation:

```bash
pnpm gen:client
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
```

Additionally verify:

- no OpenAPI breaking change is reported for existing routes;
- import suggestion chronological evaluation remains at its approved baseline;
- the authenticated route is included in the tenancy probe suite;
- no new bundle dependency is introduced; and
- keyboard-only and 320 px responsive checks pass manually.

## 20. Rollout and rollback

This feature has no migration and no persisted recommendation state, so rollout
is low risk.

Recommended rollout order:

1. Ship shared/backend route and generated client.
2. Ship picker behind one code-level feature flag only if staged deployment is
   needed.
3. Enable quick add and new-entry drawer.
4. Enable transaction detail surfaces after interaction verification.

Rollback is removing the picker integrations and leaving existing category
`Select` controls. The backend read route may safely remain because it has no
side effects. Never roll back by weakening category validation or mutating saved
transactions.

## 21. Definition of done

- [ ] One deterministic engine powers imports and interactive context.
- [ ] Complete active category list is always available.
- [ ] Recommendations never auto-assign.
- [ ] All four transaction surfaces use the reusable picker.
- [ ] Exact schemas and generated client are committed.
- [ ] Privacy and tenancy tests pass.
- [ ] Import ranking regression tests pass unchanged.
- [ ] Loading, empty, degraded, error, and success states are implemented.
- [ ] Keyboard, screen-reader, reduced-motion, dark-mode, and mobile behavior
      are verified.
- [ ] All repository quality gates pass with zero lint/type errors.
