# Personal category recommendations

## Decision

Make assigning a category fast by placing a short, ranked **Recommended for
you** list above the full searchable category list. Recommendations are based
only on the current user's prior accepted categories, filtered by transaction
type. They are advisory: a category is never assigned until the user selects
it and saves the transaction.

The first delivery uses deterministic personal history and the existing
category-suggestion engine. It does not use a global popularity model, an LLM,
or another external service.

## Why personal, not globally “most used”

The categories that are most common across all users are rarely the ones a
person wants at the point of entry. `Rent`, `Groceries`, and `Fuel` may be
common, but a user who mostly records `Office lunch`, `Metro`, and `SIP` needs
their own habits surfaced. Global data would also introduce privacy,
explainability, and cold-start problems without solving the repetitive-picker
problem well.

“Most used” therefore means **most used by this user**, for the current
expense or income type. It is a fallback, not an automatic decision.

## User experience

### Category picker

In quick add, transaction-detail category editing, and any future transaction
classification sheet, replace the flat picker with:

```text
Category
  Recommended for you
  [Groceries] [Dining] [Metro] [Subscriptions] [Shopping]

  All expense categories                         Search…
  • Bills & utilities
  • Dining
  • Groceries
  …
```

Recommendations are accessible buttons with the same selected state as a
normal category option. Keyboard users can reach them before the search box;
screen readers hear the category name and a concise reason, such as
“Recommended: used 12 times recently.” The full list remains available, so a
recommendation never hides a valid choice.

When a description is present, the first recommendation can be contextual:
`Recommended because similar past transactions were Groceries`. When there is
no dependable description match, show the user's frequent/recent categories.
Changing Expense to Income immediately recomputes the set from income
categories only.

The UI does not write usage counters when it merely displays suggestions.
Usage changes only when the user actually saves a category selection on a
posted transaction.

## Ranking policy

Return at most five active categories of the requested transaction type.
Deduplicate categories across stages, then use the following ordered cascade:

1. **Explicit user rule** — existing longest description-substring rule.
2. **High-confidence personal description match** — reuse the current exact
   counterparty and calibrated similarity stages.
3. **Frequent and recent personal choices** — rank categories from the user's
   eligible transaction history by a deterministic score: count, then recency,
   then stable category-id order as the final tie-breaker.
4. **Recent choices** — fill unused slots with the most recently selected
   categories if frequency has too little evidence.

Eligibility matches the current suggestion engine: only the user's posted,
categorized, non-reversed transactions older than the target event, with an
active category of the same type. Asset-funded transactions should be excluded
from consumption-category recommendation history once asset funding is
implemented.

The system abstains from contextual suggestions when evidence is weak or
ambiguous. Frequent/recent suggestions can still be displayed as shortcuts,
clearly labelled with their different reason; they do not claim confidence.

## Backend design

Extend the existing `CategorySuggestionService` rather than creating a second
recommendation engine. It already provides private, bounded, deterministic
history ranking for imports. Extract its shared history preparation and add a
category-recommendation query that produces a ranked list plus compact
provenance.

Suggested shared schemas:

```ts
CategoryRecommendationRequest = {
  type: "expense" | "income";
  description?: string;
  occurredAt: Date;
  limit?: number; // 1–5, defaults to 5
}

CategoryRecommendation = {
  categoryId: string;
  reason: "explicit_rule" | "personal_match" | "frequent" | "recent";
  evidenceCount?: number;
  confidenceBps?: number;
  algorithmVersion: number;
}
```

Expose a tenant-scoped read endpoint such as `POST
/api/v1/category-recommendations/query`. A body is appropriate because the
description is query input and must not be exposed in a URL or logs. The
controller parses the request with Zod, obtains `userId` only from the session,
and calls one service method. No recommendation result is persisted.

Use the existing bounded history query (maximum 500 rows, 3,660-day lookback)
for the first implementation. It avoids a new aggregate table and keeps the
result reproducible from ledger history. The endpoint must return quickly and
abstain/degrade to frequent categories if the contextual matching budget is
exhausted.

## Frontend data flow

Add a generated-client query hook keyed by transaction type, normalized
description, and date. Load the generic frequent/recent list when the picker
opens, then debounce description-aware requests while a user types. Do not
block the category picker or transaction submission while a recommendation is
loading or fails.

The picker preserves a category explicitly selected by the user; an arriving
recommendation cannot overwrite it. The existing idempotency key and
transaction mutation flow remain unchanged because recommendations are reads,
not mutations.

## Learning boundary

The product “learns” only from transactions the user has explicitly saved with
a category. A user correction is automatically reflected in later rankings
because the old categorization is no longer eligible after correction. The UI
may offer **Create rule from this choice** after repeated decisions, but never
creates a category rule silently.

No raw narration, merchant name, or category is emitted in logs, metrics,
analytics labels, or notifications. Metrics stay aggregate only: suggestion
shown, chosen unchanged, changed, and dismissed.

## Delivery order

1. Add frequent/recent personal category recommendations to the category
   picker, backed by a bounded read endpoint and reason labels.
2. Reuse the current deterministic contextual suggestion engine for a
   description-aware first choice.
3. Instrument aggregate acceptance/correction rates and perform chronological
   evaluation before changing ranking thresholds.
4. Offer optional user-confirmed rule creation for repetitive merchants.

## Required tests

- Expense requests never return income, archived, cross-tenant, reversed, or
  uncategorized categories.
- A user's frequent categories rank above less-used ones; ties are stable and
  deterministic.
- An explicit rule and a calibrated personal match rank ahead of generic
  frequent/recent shortcuts.
- Ambiguous or low-evidence descriptions do not produce a falsely confident
  contextual match.
- A recommendation response does not change a transaction or create a rule.
- The picker keeps a user-selected category when recommendations refresh and
  remains fully usable while loading or after an error.
- The endpoint respects the bounded-history resource contract and emits no raw
  transaction text in logs or metrics.

