# Weekly AI Financial Review — Architecture and Value-Validation Proposal

**Status:** Proposal only. No implementation is authorized by this document.

**Date:** 2026-08-02

**Goal:** Produce a genuinely useful, evidence-backed weekly review of a user's financial
position without allowing an LLM to calculate ledger truth, access credentials, operate tools,
or invent financial facts.

**Product name used in this document:** _Weekly Financial Review_. “AI summary” understates the
intended value and encourages generic prose; the feature must behave like a concise review with
prioritized findings, supporting evidence, and a realistic next-week plan.

## 1. Executive decision

Build this as a deterministic financial-analysis workflow with one bounded LLM narration step.
Do not build an autonomous financial agent.

The recommended first version is:

- a true weekly run, Sunday at 07:00 `Asia/Kolkata`, after the existing 02:00 rollup and 05:00
  spending-warning jobs;
- one durable BullMQ job per opted-in user and weekly period;
- an immutable, zod-validated financial snapshot assembled by application code;
- all arithmetic, comparisons, projections, thresholds, and evidence computed locally;
- one synchronous structured-output request to a cloud model, with no tools and no conversation
  memory;
- semantic validation that every conclusion references supplied evidence;
- a deterministic rules-only fallback when the provider fails or the output is invalid;
- an in-app review history as the source of truth;
- an optional external notification containing only a teaser and deep link, never financial
  figures;
- a shadow-mode evaluation phase that must prove the LLM adds value beyond a rules-only summary
  before the feature is enabled for users.

Use the provider's official SDK behind a small internal `FinancialNarrativeProvider` boundary.
For the initial research baseline, use OpenAI's Responses API with strict structured output and
`store: false`. Start the quality pilot with GPT-5.6 Terra, evaluate GPT-5.6 Luna against the same
golden dataset, and deploy the cheapest model that passes every correctness and usefulness gate.
The model must remain configuration, not domain architecture.

Do not add LangGraph, LangChain, a vector database, embeddings, RAG, multi-agent orchestration,
web search, code execution, file upload, or long-term model memory to the first version.

## 2. Why this can be useful — and when it is not

An LLM does not create value merely by paraphrasing totals. The feature is not worth shipping if
it says things like “You spent ₹18,500 this week. Consider spending less.” The dashboard already
shows totals more accurately and more quickly.

The product earns its place only when it reduces the work required to answer five questions:

1. What materially changed?
2. What evidence explains the change?
3. Are cash flow, budgets, obligations, net worth, and goals on track?
4. What is likely to matter before the next review?
5. What one or two realistic actions have the highest value now?

A useful finding has four parts:

- **Observation:** a specific change or condition;
- **Evidence:** exact metrics calculated by TreasuryOps;
- **Implication:** why the condition matters in the user's current plan;
- **Action:** a bounded next step derived from available headroom, obligations, or goals.

Example product shape (illustrative, not a generated prompt):

> Dining spend is materially above its eight-week pattern and is now the main reason the monthly
> lifestyle budget is projected to finish over plan. Keeping next week's dining spend within the
> displayed target would bring the projected month close to budget.

The exact amounts, baseline, projection, and target displayed alongside this text must come from
server-calculated evidence. The LLM chooses what matters and explains the relationship; it does
not calculate those numbers.

### 2.1 Value principles

- **Selective:** show at most three primary insights and two positive signals. More findings are
  not more useful.
- **Comparative:** compare against the user's own history and plans, not generic population norms.
- **Actionable:** recommend an action only when the data can quantify a feasible target.
- **Non-repetitive:** suppress a finding if it is materially unchanged from the previous review.
- **Calibrated:** distinguish `on_track`, `watch`, `at_risk`, and `insufficient_data`; avoid an
  arbitrary “financial health score.”
- **Evidence-first:** every insight must deep-link to the relevant budget, goal, bill, account
  group, or filtered transaction view.
- **Quiet when appropriate:** a week with no meaningful change should produce a short “no material
  change” review and no external notification.
- **Informational:** the review explains recorded data and plan progress. It is not tax, investment,
  credit, legal, or regulated financial advice.

### 2.2 Explicit non-goals

The first version does not:

- predict markets, security prices, interest rates, or asset returns;
- recommend investments, loans, credit products, or tax strategies;
- label activity as fraud;
- infer demographic, medical, religious, political, or relationship attributes;
- move money, edit a budget, create a transaction, or call any write tool;
- chat with the user or remember a conversation;
- read arbitrary documents, bank statement files, emails, or the web;
- replace the existing deterministic spending-warning feature;
- produce a review solely because a cron fired when data quality is insufficient.

## 3. Repository findings that constrain the design

The repository already owns the difficult operational primitives:

- `MonthlyRollupRepository` computes IST-aware income, expense, category, and account aggregates.
- `DashboardService` already exposes savings-rate, net-worth, cash-flow, spend-mix, top-spending,
  investment, and recurring-forecast calculations.
- budgets expose limits, progress, remaining amounts, utilization, and state.
- goals expose progress and target-date/current-rate plans.
- credit-card bills expose cycle totals, due dates, and payment state.
- spending warnings compute robust personal-history signals without an ML dependency.
- `ScheduledRunCoordinator` provides durable run claims and history.
- BullMQ already runs user-scoped background analysis jobs with deterministic job IDs, retries,
  retention policy, correlation IDs, and worker-only processors.
- the notification outbox already separates transactional creation from slow external delivery.

This means the proposed workflow should compose existing domain services or purpose-built
tenant-scoped read repositories. It should not duplicate dashboard calculations in prompts or
allow the model to query repositories dynamically.

### 3.1 Ledger constraints remain unchanged

- Money remains integer paise throughout the input, evidence, persistence, and API contracts.
- The LLM never receives formatted money strings as its authoritative values.
- The ledger remains append-only. A review cannot update or correct a transaction.
- Transfers and reversal mechanics must be excluded or represented consistently with reports so
  that they do not appear as spending.
- Every repository query is scoped by `userId`.
- Worker-wide user discovery, if required, is an explicitly named `system*` method that returns
  the owning `userId` and is unreachable from an API-role service path.
- No provider request occurs inside a database transaction.
- Calendar boundaries are computed in `Asia/Kolkata`; persisted instants and wire dates are UTC.

### 3.2 “Weekly” versus “exactly four times per month”

A seven-day cadence averages 4.35 reviews per calendar month and occasionally produces five
reviews in one month. Exactly four calendar runs (for example the 7th, 14th, 21st, and 28th) leave
an uneven gap around month boundaries and are not truly weekly.

Recommendation: run every Sunday at 07:00 IST and describe the product as weekly, approximately
four times per month. If cost or notification volume later requires an exact cap, keep all weekly
analysis but suppress redundant publication rather than distort the calendar windows.

## 4. Framework decision

### 4.1 Recommended: existing scheduler + BullMQ + direct provider SDK

This workflow has a predetermined path:

1. claim the weekly run;
2. discover opted-in users;
3. enqueue one user-scoped job;
4. build and validate the snapshot;
5. derive deterministic evidence and candidates;
6. invoke one model;
7. validate and render its structured result;
8. persist the review and optionally enqueue a notification.

LangChain's own documentation distinguishes workflows with predetermined code paths from agents
that dynamically choose processes and tools. LangGraph persistence is designed for graph state,
conversation continuity, human-in-the-loop interruption, time travel, and long-running agent
recovery. Those are useful capabilities, but TreasuryOps already has the required queue, lease,
retry, PostgreSQL, and scheduler primitives. Adding a second durability model would increase
failure modes and operational surface without improving this one-call workflow.

The provider call should sit behind a small internal interface so domain code depends on a
TreasuryOps contract, not an OpenAI/Google/Anthropic response type. Changing providers then means
implementing and evaluating another adapter, not rewriting orchestration.

### 4.2 Decision matrix

| Option | Strength | Cost in this repository | Decision |
| --- | --- | --- | --- |
| Existing BullMQ + direct provider SDK | Smallest dependency and operational surface; native structured output | A thin adapter must be maintained | **Use for v1** |
| LangChain | Provider normalization, prompt/model helpers, structured output | Adds abstractions for a single call; provider-specific behavior still needs testing | Defer until multiple providers are actively used |
| LangGraph | Durable branching, checkpoints, human-in-the-loop, agent memory | Duplicates BullMQ/scheduler persistence; no dynamic graph is needed | Do not use for v1 |
| Vercel AI SDK Core | Clean TypeScript provider abstraction and zod-based object generation | New cross-provider abstraction and dependency for one backend call | Revisit if provider switching becomes a real requirement |
| Self-hosted open-weight model | Financial data stays on the home deployment | Model operations, hardware, latency, quality variance, and larger evaluation burden | Optional privacy mode after cloud quality baseline |
| Multi-agent/critic graph | Can generate and critique several answers | Higher cost, latency, variance, and more unsupported-claim paths | Reject for v1 |

### 4.3 Conditions that would justify LangGraph later

Reconsider LangGraph only if the product gains several of these requirements simultaneously:

- user approval interrupts before a proposed action;
- multiple model/tool steps with conditional branches;
- resumable multi-day conversations about a review;
- dynamic research or document ingestion;
- a planner that chooses from many independently permissioned tools;
- human correction of intermediate state followed by graph resumption.

Even then, ledger writes must remain ordinary TreasuryOps services behind explicit confirmation;
the graph must never become a repository layer.

## 5. High-level architecture

```mermaid
flowchart LR
  A["Sunday 07:00 IST cron"] --> B["ScheduledRunCoordinator"]
  B --> C["Discover opted-in user IDs"]
  C --> D["BullMQ: one deterministic job per user/week"]
  D --> E["Build tenant-scoped financial snapshot"]
  E --> F["Deterministic metrics, signals, and evidence"]
  F --> G["Persist pending run + immutable input hash"]
  G --> H["One structured LLM request; no tools"]
  H --> I["Zod + semantic + evidence validation"]
  I -->|valid| J["Render trusted metrics into narrative"]
  I -->|invalid/provider failure| K["Rules-only fallback"]
  J --> L["Persist published review"]
  K --> L
  L --> M["In-app review history"]
  L --> N["Optional outbox teaser + deep link"]
```

### 5.1 Trust boundaries

```mermaid
flowchart TB
  subgraph T["Trusted TreasuryOps boundary"]
    DB["PostgreSQL ledger and plans"]
    SNAP["Snapshot builder"]
    CALC["Deterministic calculation engine"]
    VALIDATE["Output validator and renderer"]
    STORE["Review persistence"]
  end
  subgraph U["Untrusted probabilistic boundary"]
    LLM["Cloud LLM: prioritization and prose"]
  end
  DB --> SNAP --> CALC
  CALC -->|"bounded pseudonymous JSON"| LLM
  LLM -->|"schema-constrained proposal"| VALIDATE
  CALC --> VALIDATE --> STORE
```

The model is outside the trust boundary even when it returns valid JSON. Schema validity proves
shape, not factual correctness.

## 6. Scheduling and job lifecycle

### 6.1 Scheduler

- Cron: Sunday 07:00 `Asia/Kolkata`.
- Process: worker role only, matching existing scheduled services.
- Scheduler run key: `financial_reviews.schedule:<IST-date>`.
- User job ID: `<userId>:<weekStartIST>:v<analysisVersion>`.
- Eligibility: explicit user opt-in, at least one posted transaction, and no active deletion or
  privacy-disable state.
- Discovery returns only user IDs; all later reads receive `userId` first.

The schedule deliberately runs after rollup and spending-warning jobs. The snapshot can reuse
fresh persisted results, but it must tolerate either upstream job being late by computing or
marking the affected section unavailable rather than failing the entire review.

### 6.2 Per-user state machine

| State | Meaning |
| --- | --- |
| `queued` | Deterministic job exists but processing has not started |
| `building_snapshot` | Worker holds a lease and is assembling source data |
| `awaiting_model` | Valid snapshot/evidence has been persisted and the provider call is outside any transaction |
| `validating` | A provider response exists but is not trusted or user-visible |
| `published_ai` | AI narrative passed all gates |
| `published_fallback` | Rules-only review published because AI was unavailable or invalid |
| `no_material_change` | Review persisted; no notification emitted |
| `insufficient_data` | Coverage is too weak for responsible conclusions |
| `failed` | Terminal infrastructure failure; no review was published |

### 6.3 Idempotency and recovery

- A unique `(userId, weekStartIST, analysisVersion)` key permits one logical review.
- A claim token and lease prevent two workers from publishing concurrently.
- Retrying a provider call may incur duplicate inference cost, but cannot create a duplicate review.
- Persist the input hash before the provider call. If a completed valid result for the same hash
  already exists, reuse it rather than call the provider again.
- If the model succeeds but the final database transaction fails, the retry may call the model
  again unless the raw validated result was durably staged. Persisting a short-lived staged result
  before publication closes this gap.
- Publishing the review and writing the notification outbox entry occur in the same short
  transaction. The provider call never occurs in that transaction.
- Terminal failure exposes operational status but never leaks prompts, financial figures, or model
  output into logs.

## 7. The financial snapshot: what the model receives

The model should receive a bounded analytical snapshot, not a database dump. “Bounded” protects
privacy and cost, but it also improves quality: the model sees definitions, comparable periods,
and precomputed evidence rather than thousands of inconsistent rows.

### 7.1 Snapshot invariants

- Parsed by a strict zod schema before leaving the worker.
- Versioned independently from the output and prompt schemas.
- All money fields are integer paise.
- Ratios cross the boundary as integer basis points where practical.
- Every period contains explicit UTC boundaries and its IST calendar label.
- Missing data is explicit (`unavailable` with reason), never silently zero.
- Transfers, reversed originals, and reversal entries follow the same eligibility rules as reports.
- Each evidence item has a stable opaque ID within the review.
- No raw database primary key is necessary outside the server; use per-review opaque references.
- Arrays have hard maximum lengths and deterministic ordering.
- The complete serialized snapshot has a token/byte budget. Exceeding it triggers deterministic
  compaction, never truncation in the middle of an object.

### 7.2 Recommended context windows

| Data | Detail | Purpose |
| --- | --- | --- |
| Current review period | Daily + category/account-type aggregates | Explain this week |
| Previous 8 weeks | Weekly aggregates | Short-term personal baseline |
| Previous 90 days | Daily/category aggregates and bounded anonymized notable events | Seasonality and concentration |
| Previous 12 months | Monthly aggregates | Income, spending, savings, and net-worth direction |
| Current month | Budget and month-to-date projections | Plan adherence |
| Next 30 days | Recurring inflows/outflows, bill due dates, goal requirements | Forward risk |
| Active goals | Progress, target, required pace, projected completion | Goal trajectory |
| Active assets/liabilities | Type-level values and valuation freshness | Net-worth context |

Raw 12-month transaction rows are unnecessary. PostgreSQL and pure TypeScript calculations are
better at aggregation and arithmetic, while the model benefits from the smaller signal-rich view.

### 7.3 Snapshot sections

| Section | Representative fields |
| --- | --- |
| `meta` | schema version, review ID, source-through instant, IST period, currency, analysis version |
| `coverage` | history start, transaction count, categorized rate, valuation freshness, missing sections |
| `position` | liquid balance, credit-card balance, assets, liabilities, net worth, changes |
| `cashflow` | period income, expense, net cash flow, savings rate, comparable baselines |
| `spending` | essential/lifestyle/uncategorized mix, top category movements, concentration |
| `budgets` | planned, spent, remaining, utilization, projected finish, required weekly correction |
| `goals` | progress, target, target-date pace, current-rate projection, weekly contribution gap |
| `obligations` | bills due, amount remaining, recurring outflows/inflows, near-term net commitment |
| `warnings` | existing deterministic warning kind, severity, window, and evidence references |
| `changes` | material deltas since the previous review, including resolved issues and new wins |
| `candidates` | deterministic insight candidates with priority inputs and suppression reasons |
| `evidence` | canonical metric values, comparison periods, confidence/coverage, and deep-link descriptor |

### 7.4 Deterministic evidence catalogue

An evidence item should contain:

- opaque evidence ID, such as `e_014`;
- metric kind, such as `budget_projected_overspend`;
- subject kind and opaque subject reference;
- current integer value and unit (`minor`, `bps`, `count`, `days`, `date`);
- comparison value, if applicable;
- absolute delta and ratio computed locally;
- period boundaries;
- data-coverage grade;
- a server-owned deep-link descriptor;
- a human label generated locally from approved category vocabulary, if safe.

The LLM may reference evidence IDs but cannot create evidence. The renderer resolves IDs to trusted
values and links after validation.

### 7.5 What “all useful financial data” means

The cloud model may receive:

- exact balances, income, expenses, asset values, liabilities, budget limits, goal targets, bill
  amounts, and recurring amounts;
- exact or bucketed dates needed for trends and upcoming obligations;
- normalized account types and category labels;
- anonymized transaction events when a large or unusual event materially affects the review;
- the user's own historical baselines and deterministic projections.

This is intentionally rich. Removing identity does not require rounding away useful money values.

## 8. Data that must not cross the provider boundary

### 8.1 Never send

| Repository data | Reason |
| --- | --- |
| Name, email, display name, profile image | Direct identity; no analytical value |
| Password, session token, verification value | Authentication secret |
| OAuth access/refresh/ID token | External-account compromise risk |
| API keys and key metadata | Credential compromise risk |
| IP address and user agent | Device/network identifier; no financial value |
| Raw `userId`, transaction/account/asset UUIDs | Linkability; replace with per-review opaque references |
| Idempotency keys, claim tokens, hashes, correlation IDs | Operational secrets/no analytical value |
| Raw CSV/base64 content | Unbounded bank data and possible account/counterparty identifiers |
| Raw statement rows and upload mappings | May contain account numbers, UPI IDs, references, and arbitrary columns |
| Uploaded filenames | Often include bank/account/date/name fragments |
| Audit metadata and notification payloads | May duplicate sensitive before/after state |

### 8.2 Standard mode: exclude free text

Standard mode sends no transaction descriptions, tags, account names, asset names, goal names,
recurring descriptions, category-rule patterns, or custom notes. It uses:

- normalized categories;
- account types (`bank`, `cash`, `wallet`, `credit_card`, `investment`);
- asset kinds;
- opaque subject references;
- locally generated safe labels such as “Dining” or “Credit card 1.”

This should be the default because free text provides a relatively small quality gain compared
with its privacy and prompt-injection surface.

### 8.3 Optional detailed-insights mode

If later research shows merchant-level context materially improves usefulness, add a separate,
explicit opt-in. Do not simply forward descriptions.

The local sanitizer must remove or reject:

- email addresses and UPI-style identifiers;
- phone numbers and long digit sequences;
- account/card fragments and transaction reference numbers;
- URLs, markup, control characters, and instruction-like text;
- person names where confidently detected;
- uncommon free-form tags;
- strings that cannot be normalized to a bounded merchant/category label.

The result should be a normalized label such as “food delivery service,” not the original bank
narration. Sanitized labels remain untrusted data and cannot grant the model tools or permissions.

## 9. Deterministic analysis engine

The analysis engine is the feature's real financial intelligence. It should create candidate
findings before the LLM runs.

### 9.1 Candidate families

#### Cash-flow health

- income, expense, and net cash flow for the completed period;
- savings-rate change versus recent comparable periods;
- rolling income stability and expense volatility;
- weeks where expense exceeds income, with appropriate salary-cycle context;
- liquid-balance coverage of known next-30-day obligations.

#### Spending movement

- material category increases/decreases versus robust personal baselines;
- essential/lifestyle/uncategorized mix changes;
- concentration in one category or bounded anonymous event;
- newly recurring-looking commitments, only when determined by approved local rules;
- resolved spikes and meaningful positive improvement.

#### Budget trajectory

- month-to-date utilization relative to elapsed IST month;
- projected month-end spend using a documented deterministic method;
- projected over/under amount;
- the maximum next-week spend or required reduction that would return the budget near plan;
- unbudgeted spending that materially weakens the apparent plan.

#### Goal trajectory

- progress since the previous review;
- required versus actual contribution pace;
- projected completion at current pace;
- target-date gap;
- conflicts between near-term obligations and suggested goal contributions.

#### Bills and commitments

- credit-card amount due and due date;
- payment status and liquid coverage;
- recurring inflows/outflows before the next review and within 30 days;
- unusually dense obligation periods;
- no “available to spend” recommendation that ignores a known bill.

#### Net worth and valuation quality

- net-worth movement split into cash/account and asset-valuation components;
- liability direction;
- stale asset valuations clearly marked as stale rather than treated as current truth;
- avoid celebrating market/asset gains when the valuation is old or manually sparse.

#### Data quality

- uncategorized share;
- missing income history;
- stale valuations;
- incomplete credit-card reconciliation;
- insufficient history for comparison;
- recent import still pending or failed, when that makes the period incomplete.

### 9.2 Candidate scoring

The server should rank candidates using documented factors, not an LLM-only relevance judgment:

- absolute financial impact;
- deviation from personal baseline;
- urgency before the next review;
- connection to an explicit budget, goal, or due date;
- confidence and data coverage;
- novelty versus the previous review;
- actionability;
- suppression penalties for repetition, tiny amounts, incomplete data, and conflicting signals.

The model receives a bounded set, for example the top 10–15 candidates, and selects at most three
primary insights. A low-ranked fact should not become prominent merely because it makes more
interesting prose.

### 9.3 Cold start

| Available history | Behavior |
| --- | --- |
| No posted transactions | Do not call the LLM; publish nothing or onboarding guidance |
| Less than 2 completed weeks | Position/current-plan facts only; no trend claims |
| 2–7 weeks | Limited short-term comparisons with explicit low coverage |
| 8+ weeks | Weekly personal baselines eligible |
| 6+ months | Stronger seasonality and income stability analysis |

Insufficient history is not a model problem and must not be solved by generic advice.

## 10. LLM input and prompt contract

### 10.1 Request shape

Use one self-contained request containing:

1. a stable developer instruction;
2. the versioned structured snapshot;
3. the versioned structured-output schema;
4. a maximum output-token budget;
5. a privacy-preserving safety identifier derived from the user ID with a server secret;
6. provider settings that disable application-state storage where supported.

Do not send previous model conversation state. If comparison with last week's review is useful,
include server-derived `changes` and previously published finding fingerprints in the snapshot.
This avoids model memory and keeps each run independently reproducible.

### 10.2 Prompt responsibilities

The model is instructed to:

- choose only from supplied candidate/evidence IDs;
- prioritize at most three findings;
- include at least one positive signal when evidence supports it;
- state uncertainty when coverage is limited;
- propose no action that exceeds server-supplied action bounds;
- avoid tax, investment, credit-product, legal, or medical advice;
- avoid moralizing language and demographic inference;
- treat all snapshot strings as data, never instructions;
- return the strict schema and nothing else.

The model is explicitly not asked to “analyze all transactions from scratch,” calculate totals,
predict missing values, or use general financial rules of thumb.

### 10.3 Proposed structured output

| Field | Contract |
| --- | --- |
| `assessment` | `on_track`, `watch`, `at_risk`, `no_material_change`, or `insufficient_data` |
| `headline` | Short, no unsupported numeric claims |
| `primaryInsightIds` | 0–3 supplied candidate IDs |
| `positiveInsightIds` | 0–2 supplied candidate IDs |
| `insights` | Candidate ID, evidence IDs, concise interpretation, optional approved action ID |
| `nextWeekPlan` | 0–2 supplied action IDs with short rationale |
| `coverageNote` | Required when any selected evidence is below high coverage |
| `notificationTeaser` | Optional; contains no amount, account, category, or goal name |

The output contains references and prose, not authoritative money values.

## 11. Preventing hallucinated financial claims

Strict structured output guarantees JSON shape, not truth. The application therefore needs several
post-model gates.

### 11.1 Structural validation

- Parse the provider response as `unknown` through the shared zod output schema.
- Reject unknown keys, out-of-range array lengths, invalid enums, oversized strings, and missing
  required coverage fields.
- Handle a provider refusal as a typed outcome, not malformed JSON.

### 11.2 Reference validation

- Every candidate, evidence, action, and subject reference must exist in the submitted snapshot.
- Selected evidence must belong to the selected candidate.
- An action must be one of the candidate's server-approved actions.
- Deep links are resolved locally; the model never returns a URL.

### 11.3 Numeric grounding

Preferred rendering strategy:

- LLM prose is number-free or contains only validated evidence placeholders.
- Exact amounts, percentages, dates, and counts are rendered from the evidence catalogue by the
  server/UI.
- Placeholders must match a strict token grammar and resolve to evidence referenced by the insight.

If free-form numeric prose is allowed during experimentation, a claim checker must reject any
currency amount, percentage, count, or date that is not an exact approved rendering of referenced
evidence. The safer placeholder strategy should be the launch requirement.

### 11.4 Semantic policy checks

Reject or fall back when output:

- introduces an unsupported causal claim (“because you travelled”);
- recommends a financial product or security;
- labels spending as fraud, addiction, irresponsibility, or a protected/sensitive trait;
- recommends spending or transfers above a supplied bound;
- ignores a higher-priority imminent obligation;
- claims confidence inconsistent with evidence coverage;
- substantially repeats last week's narrative without a material delta;
- contains instruction-following artifacts from snapshot text.

### 11.5 Retry policy

- One repair retry is permitted for a structural/reference failure, using only terse validation
  errors and the same snapshot hash.
- Do not repeatedly prompt until an answer passes; that hides systematic quality problems and
  increases cost/variance.
- Semantic or safety failures should normally use the rules-only fallback and emit a metric for
  evaluation.

## 12. Rules-only fallback

The fallback is a first-class product, not an error page. It should render the top deterministic
candidates with their trusted metrics and predefined neutral copy.

Use it when:

- the provider times out or rate-limits;
- the response is refused, malformed, unsupported, or unsafe;
- the user disables cloud processing but still wants a local weekly review;
- evaluation disables a model or prompt version;
- budget/cost circuit breakers open.

The fallback also serves as the control against which AI value is measured. If users cannot
reliably prefer or benefit from the AI version, remove the LLM integration and keep the
deterministic review.

## 13. Persistence proposal

Use additive schema changes in a separate implementation PR. Names below are conceptual.

### 13.1 User preference

One row per user:

- enabled/disabled;
- consent version and consented-at timestamp;
- processing mode (`local_only`, `cloud_standard`, future `cloud_detailed`);
- delivery preference (`in_app`, future external teaser);
- preferred review weekday if customization is later approved;
- disabled-at timestamp.

No user is silently opted in.

### 13.2 Review run

One row per logical user/week/version:

- ID and tenant-scoped unique key;
- week start/end and source-through instant;
- state, attempt count, claim token, lease, and terminal error code;
- snapshot schema, analysis, prompt, renderer, and output schema versions;
- provider/model identifiers;
- input hash and output hash;
- token usage, latency, and estimated cost as operational metadata;
- created, started, completed, and published timestamps.

Do not store provider request IDs if they make external correlation materially easier unless they
are needed for support; if stored, treat them as restricted operational metadata.

### 13.3 Review document

Store locally:

- assessment and publication mode (`ai` or `fallback`);
- selected candidate/evidence/action references;
- validated prose fragments;
- trusted rendered metric values or the immutable evidence needed to render them;
- data-coverage summary;
- notification decision and suppression reason;
- model/prompt/analysis versions.

Persist enough evidence to reproduce exactly what the user saw even if live balances later change.
Do not store the full provider wire payload, raw provider reasoning, or secrets.

### 13.4 Retention

Initial recommendation:

- retain published reviews and their minimal evidence for 12 months so users can see how their
  financial story changed;
- retain failed/staged raw model outputs only long enough for automated validation and bounded
  debugging, then delete them;
- never copy full prompts or snapshots into logs or tracing services;
- when a user disables AI, stop future jobs immediately and offer deletion of derived AI reviews;
- account deletion removes derived review data with the rest of the user's data.

## 14. API and frontend product surface

### 14.1 API shape

Potential endpoints, all under `/api/v1/` and backed by shared zod schemas:

- latest review;
- cursor-paginated review history;
- review detail with evidence;
- preference/consent read and update;
- helpful/not-helpful feedback submission;
- optional user-requested deletion of derived reviews.

Do not add a “regenerate” endpoint in v1. It complicates idempotency, cost, comparison, and abuse
controls without clear user value.

### 14.2 Dashboard

The dashboard card should show:

- review period and data-through timestamp;
- assessment and one-sentence headline;
- at most three expandable insights;
- trusted metric chips and “view evidence” links;
- one or two next-week actions;
- coverage/staleness warning;
- “AI-assisted analysis of your recorded data” disclosure;
- helpful/not-helpful feedback;
- history link.

It must not resemble an authoritative advisory report. Users should be able to inspect the exact
transactions/rollups or plan objects behind each insight.

### 14.3 Notifications

Ship in-app first. Add external notification only after usefulness is demonstrated and a real
notification adapter exists.

Allowed teaser:

> Your weekly financial review is ready. One change may need attention.

Disallowed teaser:

> You overspent Dining by ₹3,240 and your HDFC balance is low.

Suppress the external notification for `no_material_change`, `insufficient_data`, fallback-only
provider incidents, or unchanged repeated findings.

## 15. Provider and model recommendation

### 15.1 Provider interface

The domain should depend on a provider-neutral contract with inputs and outputs defined in
`packages/shared` or an API-internal contract module. The adapter owns:

- provider authentication;
- model selection and request settings;
- zod/JSON Schema conversion;
- timeout and provider error classification;
- token/cost metadata extraction;
- refusal handling;
- `store: false` and equivalent privacy settings.

The adapter does not own financial prompts, calculations, scheduling, persistence, or fallback.

### 15.2 OpenAI baseline

Why it is a reasonable first reference:

- official JavaScript SDK integration with zod-based structured output;
- current GPT-5.6 tiers cover quality/cost experiments behind the same API;
- API inputs/outputs are not used for training by default;
- application-state storage can be disabled for eligible synchronous calls;
- the use case needs one bounded response, not provider-hosted tools or memory.

Privacy configuration:

- paid API project;
- Responses request with `store: false`;
- no Files, Batch, Conversations, vector stores, background mode, web search, MCP, or code
  interpreter;
- no cloud prompt tracing;
- investigate Modified Abuse Monitoring/Zero Data Retention if the feature grows beyond personal
  use or policy requires it.

Even with `store: false`, default abuse-monitoring logs may retain customer content for up to 30
days unless approved retention controls apply. Consent language must say that a third-party model
provider processes a minimized financial snapshot; it must not claim “nothing is retained” under
the default API policy.

### 15.3 Model selection

- **Pilot:** GPT-5.6 Terra for the first quality baseline.
- **Cost challenger:** GPT-5.6 Luna on the identical evaluation set.
- **Do not default to Sol:** use only if blind evaluation shows a material, repeatable gain that
  Terra cannot meet.
- Configure model ID and reasoning effort through validated environment/runtime config.
- Pin a stable snapshot when the provider exposes a real immutable snapshot; otherwise treat every
  provider alias update as a model change requiring evals.

### 15.4 Illustrative cost

As of 2026-08-02, the cited OpenAI model pages list these text-token prices:

| Model | Input / 1M | Output / 1M | One review at 15k input + 1.5k output | Four reviews/month |
| --- | ---: | ---: | ---: | ---: |
| GPT-5.6 Luna | $0.20 | $1.20 | ~$0.0048 | ~$0.0192 |
| GPT-5.6 Terra | $2.00 | $12.00 | ~$0.0480 | ~$0.1920 |
| GPT-5.6 Sol | $5.00 | $30.00 | ~$0.1200 | ~$0.4800 |

These are planning estimates, exclude taxes/currency conversion and any reasoning-token nuances,
and must be recalculated during implementation. A true weekly cadence averages 4.35 calls/month,
about 8.75% above the four-call column.

At personal-expense-tracker scale, cost does not justify the OpenAI Batch API. Batch is discounted
but is designed for up-to-24-hour asynchronous processing and uses uploaded batch files with
different retention characteristics. A direct synchronous call from the existing worker is
simpler and more privacy-minimal.

### 15.5 Other providers

- **Gemini paid API:** supports JSON Schema/structured output. Paid-service terms state prompts and
  responses are not used to improve products, while unpaid-service terms explicitly permit broader
  use and human review. Never send financial data through unpaid quota. Evaluate only a paid project
  and the provider's current zero-retention controls.
- **Anthropic API:** commercial API inputs/outputs are not used for training by default and standard
  retention is currently documented as up to 30 days, with separately approved zero-retention
  arrangements. It is a viable adapter candidate if it passes the same schema, privacy, and eval
  contract.
- **Self-hosted:** offers the clearest data-locality story but should be judged on the same golden
  set. Do not assume privacy compensates for generic or incorrect financial conclusions.

Provider competition should happen in evaluation, not through runtime random routing. A single
review must record which provider/model produced it.

## 16. Security and privacy threat model

### 16.1 Main risks and controls

| Risk | Control |
| --- | --- |
| Credential/PII leakage | Explicit allowlist snapshot builder; never serialize database rows generically |
| Financial-pattern disclosure | Consent, bounded context, paid API, `store: false`, no logs/files/batch |
| Re-identification | Opaque per-review references; no direct identifiers; bounded free text |
| Prompt injection from descriptions/imports | Standard mode excludes free text; detailed mode sanitizes locally; no tools |
| Cross-tenant data leak | `userId`-first repository methods; tenant integration tests; job payload validation |
| Hallucinated amounts | Local calculations, evidence references, placeholder rendering, semantic validator |
| Unsafe action recommendation | Server-generated action catalogue with hard bounds; model selects only |
| Model output injection in UI | Render as text through fixed components; no raw HTML/Markdown execution |
| Secret leakage through telemetry | Log metadata only; no prompts, snapshots, outputs, evidence, or amounts |
| Provider key compromise | Validated environment secret; worker-only access; rotate and alert on misuse |
| Unexpected provider/model drift | Versioned adapter/model/prompt; shadow eval before rollout |
| Cost amplification | One logical job/week, input/output caps, concurrency, spend alerts, circuit breaker |

### 16.2 Logging policy

Allowed:

- review run ID, tenant-safe internal user ID in restricted application logs;
- correlation/job ID;
- versions;
- state transition;
- input/output token counts;
- latency;
- provider status/error class;
- candidate/insight counts;
- validation failure category;
- fallback/publication/notification decision.

Forbidden:

- prompt or snapshot body;
- provider raw response;
- transaction/category/account/goal names;
- descriptions/tags;
- amounts, percentages, dates tied to financial events;
- email, display name, provider request payload, API key, or auth data.

### 16.3 Consent copy must communicate

- what data is analyzed;
- that a third-party cloud model processes a minimized financial snapshot;
- that credentials, identity, raw statements, and standard-mode descriptions are excluded;
- provider retention at a truthful high level;
- that reviews may be incorrect and are informational;
- how to disable the feature and delete derived reviews;
- whether detailed merchant context is separately enabled.

## 17. Evaluation: prove value before integration

The project should not ship the LLM because the architecture is possible. It should ship only if
the LLM demonstrably improves the review over deterministic presentation.

### 17.1 Evaluation dataset

Create versioned synthetic/golden snapshots, never copied production prompts, for at least these
financial situations:

- stable income and spending with no meaningful change;
- salary timing near a weekly boundary;
- temporary high spending caused by a known annual/quarterly commitment;
- category spike with adequate and inadequate history;
- budget projected over plan with a feasible correction;
- several budgets over plan but one dominant driver;
- income drop;
- rising savings rate and a positive week;
- goal ahead, on pace, slightly behind, and infeasible at current rate;
- credit-card bill due before next income;
- bill already paid through a transfer;
- low liquid balance but high illiquid assets;
- liability increase/decrease;
- stale asset valuation;
- high uncategorized share;
- reversed transactions and transfers;
- no transactions, sparse history, missing income, and partial imports;
- very large valid paise values near safe-integer boundaries;
- IST/UTC month and week boundaries;
- malicious/instruction-like descriptions that must never reach standard-mode input;
- conflicting candidate signals;
- a repeated finding unchanged from the previous review.

### 17.2 Baselines and experiments

For every snapshot, compare:

1. deterministic rules-only review;
2. Terra prompt/model version;
3. Luna challenger;
4. any future provider/model;
5. previous production prompt/model when upgrading.

Review outputs blind where possible. Model/provider names should not influence helpfulness scoring.

### 17.3 Automated hard gates

Launch requires:

- 100% output-schema validity after at most one repair attempt;
- 100% candidate/evidence/action references valid;
- 100% displayed numeric claims rendered from trusted evidence;
- zero cross-tenant or disallowed-field input fixtures;
- zero unsupported investment/tax/credit/fraud recommendations;
- zero external notification amounts or identifiers;
- correct fallback on provider failure/refusal/timeout;
- deterministic suppression for no-material-change cases;
- no ledger mutation path reachable from the review worker.

Any failure in these categories blocks launch regardless of average judge score.

### 17.4 Human usefulness rubric

Score each review from 1–5 on:

- **Specificity:** could this have been written without this user's data?
- **Materiality:** are the most financially important changes prioritized?
- **Correctness:** does the interpretation match the evidence and definitions?
- **Actionability:** is any proposed next step feasible and appropriately bounded?
- **Novelty:** does it add value beyond dashboard totals and last week's review?
- **Tone:** neutral, concise, non-judgmental, and not alarmist?
- **Coverage honesty:** are missing/stale data and uncertainty visible?

Proposed pilot threshold:

- no hard-gate failures;
- median score at least 4 for specificity, materiality, correctness, and tone;
- AI review preferred over rules-only in at least 70% of cases with a stated reason;
- no more than 10% rated repetitive or obvious;
- the cheaper model can replace the pilot model only if it meets the same thresholds with no
  correctness regression.

These are initial product gates, not universal scientific constants. Record and revise them through
reviewed decisions rather than silently lowering them to ship.

### 17.5 Shadow mode

Run for 6–8 weekly cycles before external notifications:

- build snapshots and generate both AI and fallback reviews;
- expose only to an internal/pilot reviewer or a hidden diagnostics surface;
- collect usefulness labels and failure categories;
- track repetition across weeks;
- refine deterministic candidates before refining prose;
- do not use production financial payloads in third-party tracing/evaluation platforms;
- promote a prompt/model only through an explicit version change and evaluation report.

### 17.6 Production feedback

Offer “Useful” / “Not useful” with bounded reasons:

- already obvious;
- incorrect;
- not important;
- too repetitive;
- action unrealistic;
- missing context;
- tone problem;
- privacy concern.

Feedback is stored locally and is not automatically sent to the model provider. Never use provider
thumbs-up/down mechanisms with financial content unless separately reviewed, because some providers
may use explicitly submitted feedback differently from ordinary API traffic.

## 18. Observability and operations

Track:

- scheduled users, enqueued jobs, started/completed/failed runs;
- state age and lease recovery;
- snapshot build latency and size;
- input coverage by section;
- provider latency/error/refusal/rate-limit counts;
- input/output tokens and estimated cost;
- structural/reference/semantic validation failures by version;
- AI/fallback/no-change/insufficient-data publication counts;
- notification suppression reason;
- usefulness feedback and repetition rate;
- model/prompt/analysis version distribution.

Alert on:

- no successful scheduled run in eight days;
- jobs stuck beyond lease/deadline;
- terminal failure rate above a small threshold;
- validation failure spike after a model/prompt change;
- unexpected token-size or cost growth;
- reviews published without evidence;
- any forbidden-field canary detected in a provider request;
- cross-tenant invariant failure.

Operational dashboards must not label review quality solely by provider success. A 200 response that
falls back after semantic validation is a quality failure worth tracking.

## 19. Testing strategy for implementation

### 19.1 Unit tests

- IST weekly boundaries and five-Sunday months;
- snapshot compaction and stable ordering;
- every deterministic metric and candidate score;
- transfer/reversal/report eligibility consistency;
- cold-start and missing-section behavior;
- privacy allowlist and forbidden-field canaries;
- merchant/detail sanitizer if that mode is added;
- output reference, placeholder, policy, and repetition validation;
- fallback rendering;
- notification suppression;
- cost calculation and maximum-token policy.

### 19.2 Integration tests

- real PostgreSQL snapshot from multi-module fixtures;
- tenant isolation for every query and persisted review;
- worker-only system discovery preserves ownership;
- API role cannot invoke a system sweep;
- unique weekly run and lease recovery;
- publish + notification outbox atomicity;
- provider call demonstrably outside database transactions;
- disabled/deleted consent prevents future processing;
- every integration test ends with existing ledger invariants.

### 19.3 Concurrency tests

- five identical schedule invocations create one logical user job;
- five workers racing for one review produce one publication;
- provider success followed by acknowledgement/persist failure does not duplicate publication;
- preference disable racing with job start prevents provider transmission if disable wins before
  snapshot dispatch;
- notification delivery remains at-least-once with the existing claim/lease contract.

### 19.4 Provider contract tests

- success, refusal, timeout, rate limit, authentication error, 5xx, malformed body;
- strict schema support and unsupported-schema response;
- exact request privacy settings;
- no tools/files/memory/background flags;
- request size and output limit;
- token metadata parsing;
- raw provider errors are sanitized before persistence/logging.

### 19.5 Route/e2e tests

If routes are added:

- authentication and generated tenancy probe coverage;
- cursor pagination;
- consent and disable behavior;
- review evidence cannot reference another tenant;
- shared schema/OpenAPI/generated-client consistency;
- output text renders safely and cannot inject HTML/Markdown behavior.

## 20. Failure-mode decisions

| Failure | User behavior | Operational behavior |
| --- | --- | --- |
| No/insufficient data | No generic AI call; show coverage/onboarding | Successful `insufficient_data` outcome |
| Upstream rollup late | Compute approved data or mark section unavailable | Track dependency freshness |
| Provider timeout/5xx | Rules-only fallback | Retry within bounded policy; circuit breaker |
| Provider auth/config error | Rules-only fallback; no user alarm | Terminal alert; do not retry aggressively |
| Schema/reference failure | One repair attempt, then fallback | Versioned validation metric |
| Semantic/safety failure | Fallback | Quarantine raw output briefly, no logs, alert if repeated |
| Snapshot too large | Deterministic compaction | Track compaction tier; never arbitrary truncate |
| Financial data changes after snapshot | Review remains tied to `sourceThrough` | Evidence is immutable; next review captures change |
| Notification adapter unavailable | In-app review remains available | Existing outbox retry/recovery |
| User disables feature | Stop new processing and notifications | Recheck consent immediately before provider call |
| Cost threshold exceeded | Fallback/local-only until reset | Open cost circuit and alert |

## 21. Delivery plan and decision gates

### Phase 0 — contract and evaluation design

- Approve product boundary, privacy modes, evidence/output schemas, and useful/not-useful rubric.
- Build synthetic golden snapshots and a rules-only renderer.
- Decide provider and account retention settings.
- **Gate:** deterministic review alone must be coherent and correct.

### Phase 1 — deterministic snapshot and candidate engine

- Implement tenant-scoped snapshot collection and candidate scoring.
- No provider dependency and no UI notification.
- Verify performance, boundaries, and privacy allowlist.
- **Gate:** all financial math, evidence, and cold-start cases pass tests.

### Phase 2 — offline/shadow model evaluation

- Add one provider adapter and strict structured output.
- Compare Terra, Luna, and fallback over golden + approved pilot snapshots.
- Store no prompts in cloud tracing/evaluation products.
- **Gate:** all hard gates and usefulness thresholds pass.

### Phase 3 — opt-in in-app pilot

- Persist weekly review history and display evidence-backed cards.
- Collect local usefulness feedback.
- Keep notification delivery disabled.
- **Gate:** 6–8 weeks show sustained value, acceptable repetition, and no privacy/correctness issue.

### Phase 4 — external teaser notification

- Add a real notification adapter and privacy-safe review-ready outbox type.
- Suppress no-change/insufficient/fallback noise.
- **Gate:** users engage with notifications and do not report fatigue/privacy concerns.

### Phase 5 — optional enhancements

- paid-provider comparison;
- self-hosted adapter;
- separately consented sanitized merchant mode;
- user-selected focus areas;
- monthly retrospective using the same evidence architecture.

Do not start a later phase merely because the earlier one is technically complete. Each gate is a
product-value and safety decision.

## 22. Alternatives rejected for the first version

### Send the full database or raw transactions to the model

Rejected. It leaks irrelevant identity/operational data, increases token noise, exposes free text,
and asks a probabilistic system to redo arithmetic that PostgreSQL/TypeScript can verify exactly.

### Send only monthly rollups

Rejected. Privacy is strong but weekly usefulness is weak: the model cannot explain short-term
changes, upcoming obligations, budget pace, or notable events.

### Let the model call read-only finance tools

Rejected for v1. It creates dynamic behavior, tenant/tool authorization risk, prompt injection
surface, variable cost, and less reproducible reviews. A prebuilt snapshot is simpler and more
complete.

### Use LangGraph for “future-proofing”

Rejected. It solves capabilities not required today and duplicates durability already present in
BullMQ/PostgreSQL. Add it only in response to a concrete stateful-agent requirement.

### Use Batch API because the job is asynchronous

Rejected. The dollar saving is negligible at weekly personal scale, while uploaded batch files,
polling, up-to-24-hour completion, and retention behavior add complexity and privacy surface.

### Use an LLM judge as the only quality gate

Rejected. Numeric/reference/security requirements are deterministic. Human preference and
LLM-assisted scoring may supplement, but cannot replace hard validation.

### Produce a single financial health score

Rejected. A score hides assumptions, can imply false authority, and is difficult to act on. Use
explicit status plus evidence-backed factors.

## 23. Open decisions before implementation

The architecture can be approved before these are finalized, but implementation should not begin
without owners and recorded decisions:

1. Exact consent copy and derived-review deletion behavior.
2. Whether `local_only` rules-based reviews ship alongside cloud mode.
3. Final snapshot token/byte budget and compaction tiers.
4. Candidate formulas and materiality thresholds.
5. Review retention period.
6. Provider project configuration and eligibility for enhanced retention controls.
7. Golden-dataset ownership and who approves model/prompt changes.
8. Whether external notification is desirable after the in-app pilot.
9. Whether custom categories are safe to send verbatim or require normalization.
10. Exact criteria for enabling a future detailed merchant mode.

## 24. Recommended approval statement

Approve the concept only with this boundary:

> TreasuryOps will compute a versioned, tenant-scoped financial evidence snapshot locally and use
> a single tool-free structured LLM call to prioritize and explain that evidence. The model will
> not calculate ledger truth, receive identity/credentials/raw uploads, query application tools,
> or create financial actions. The feature will remain opt-in, evidence-backed, locally persisted,
> and protected by a rules-only fallback. Production launch requires proof that the AI review is
> materially more useful than the deterministic baseline without correctness or privacy failures.

## 25. Research sources

Sources were checked on 2026-08-02. Provider features, model names, pricing, and retention policies
are time-sensitive and must be rechecked during implementation.

### Orchestration and structured output

- [LangGraph: Workflows and agents](https://docs.langchain.com/oss/javascript/langgraph/workflows-agents)
  — predetermined workflows versus dynamic agents.
- [LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence) —
  checkpointers, stores, memory, interruption recovery, and fault tolerance.
- [LangChain structured output](https://docs.langchain.com/oss/javascript/langchain/structured-output)
  — provider-native and tool-based schema strategies.
- [Vercel AI SDK: Providers and models](https://ai-sdk.dev/docs/foundations/providers-and-models)
  — provider abstraction considered as a future option.
- [OpenAI structured model outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
  — JSON Schema guarantees and JavaScript/zod integration.
- [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output) — JSON
  Schema support, validation guidance, and limitations.

### Privacy, retention, and security

- [OpenAI API data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint)
  — training defaults, abuse-monitoring retention, endpoint application state, ZDR/MAM, and data
  residency.
- [Gemini API terms](https://ai.google.dev/gemini-api/terms) — materially different data-use terms
  for unpaid versus paid services.
- [Gemini zero data retention](https://ai.google.dev/gemini-api/docs/zdr) — paid-service training
  restrictions and feature-specific retention considerations.
- [Anthropic commercial training policy](https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training)
  — commercial inputs/outputs are not used for training by default.
- [Anthropic commercial retention](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data)
  — standard API retention and exceptions.
- [NIST: De-Identification of Personal Information](https://www.nist.gov/publications/de-identification-personal-information)
  — de-identification reduces but does not eliminate re-identification risk.
- [OWASP LLM Prompt Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html)
  — untrusted text, least privilege, validation, and tool separation.
- [OWASP LLM Verification Standard](https://owasp.org/www-project-llm-verification-standard/LLMSVS-v2.0-en.html)
  — stored/external content as indirect prompt injection and model outputs as untrusted data.
- [OpenAI safety best practices](https://developers.openai.com/api/docs/guides/safety-best-practices)
  — adversarial testing, constrained inputs/outputs, human oversight, and privacy-preserving safety
  identifiers.

### Model selection, cost, and evaluation

- [OpenAI model guidance](https://developers.openai.com/api/docs/guides/latest-model) — current
  GPT-5.6 tier positioning and evaluation-first model selection.
- [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna),
  [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra), and
  [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol) — current capabilities
  and pricing used in the illustrative estimate.
- [OpenAI Batch API](https://developers.openai.com/api/docs/guides/batch) — 50% discount,
  separate rate limits, file-based submission, and up-to-24-hour completion.
- [LangSmith evaluation concepts](https://docs.langchain.com/langsmith/evaluation-concepts) —
  datasets, target functions, evaluators, and version comparison. This proposal adopts the
  concepts but not cloud tracing for production financial payloads.
