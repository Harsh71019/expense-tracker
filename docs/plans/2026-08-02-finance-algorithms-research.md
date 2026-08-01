# Finance algorithms worth implementing in TreasuryOps

**Status:** research and implementation roadmap  
**Date:** 2026-08-02  
**Branch:** `codex/finance-algorithms-research`  
**Scope:** algorithms that can make this personal expense tracker more accurate, predictive, and useful without weakening its append-only ledger or integer-paise rules

## Decision summary

TreasuryOps should favor explainable, per-user algorithms that work with hundreds or a few thousand transactions. It should not start with deep learning, an LLM, ARIMA/Prophet, portfolio optimization, or a cross-user model.

The best implementation order is:

| Priority | Capability                                        | Recommendation                        | Why it is worth doing now                                                                                                             |
| -------- | ------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Versioned personal narration normalization        | Build first                           | It improves the user's categorization, recurring detection, dedupe, and reconciliation at once.                                       |
| P0       | Algorithm evaluation harness                      | Build first                           | No forecast or classifier should ship without an honest historical backtest and a simple baseline.                                    |
| P1       | Recurring inflow/outflow detection                | Build                                 | Converts raw history into expected bills, subscriptions, and income streams. This is the foundation for useful cash-flow forecasts.   |
| P1       | Hybrid 30/60/90-day cash-flow forecast            | Build                                 | Users need to know whether available cash will cover known bills and normal spending, with uncertainty shown.                         |
| P1       | Global statement reconciliation                   | Upgrade existing matcher              | A one-to-one assignment is safer and more accurate than ranking every statement row independently.                                    |
| P1       | Personal-history category suggestions             | Upgrade existing rules                | High value, low infrastructure cost, and naturally improves from user corrections. Keep it suggestion-only initially.                 |
| P2       | Calendar-aware budget pacing                      | Build                                 | A flat 80%/100% threshold cannot tell whether 60% spent on day 10 is abnormal. Historical spend curves can.                           |
| P2       | Robust anomaly detection v2                       | Extend existing detector              | Add payee-relative and recurring-amount-change warnings; retain robust median/MAD/IQR statistics.                                     |
| P2       | Goal feasibility and surplus allocation           | Extend existing goal plan             | The current target-date calculation becomes much more useful when compared with forecast disposable cash.                             |
| P3       | Debt payoff simulator                             | Build only after capturing card terms | Valuable, but calculating interest before APR, minimum-payment, grace-period, and promotional-balance data exist would be misleading. |
| Defer    | Investment returns, optimization, and rebalancing | Do not build yet                      | Asset valuations are not linked to contributions, withdrawals, fees, or disposals, so return calculations would be incomplete.        |

The first release should remain decision support. Algorithms may suggest a category, identify a stream, flag a possible duplicate, or forecast a balance. They must not silently create, modify, reverse, or delete ledger entries.

### Product boundary: improve one person's finances

Every capability in this plan must help the owner answer a personal question:

- Where is my money going, and what changed?
- Will my available cash cover upcoming bills and normal spending?
- Am I on pace to exceed a budget?
- Which recurring expenses can I review or reduce?
- How much can I safely save toward goals while retaining a buffer?
- What debt-payment scenario reduces cost or gives me manageable milestones?

Payment-rail, payee, and narration parsing exists only to make that person's own records more accurate. TreasuryOps must not build merchant profiles, business intelligence, company-level categorization, advertising segments, a shared counterparty database, or cross-user spending comparisons. A normalized counterparty key is private derived data for matching the owner's own transactions; it is not a merchant product.

## What already exists

This plan extends existing code instead of inventing parallel systems.

| Existing capability      | Current approach                                                               | Relevant code                                                  | Gap to close                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Import deduplication     | SHA-256 of user, account, IST day, amount, and normalized description          | `apps/api/src/imports/dedupe-hash.ts`                          | Exact matches only; the v1 hash omits transaction type; no near-duplicate confidence or reason. |
| Category suggestion      | Longest case-insensitive substring rule wins                                   | `apps/api/src/category-rules/suggest-category.ts`              | Does not learn from accepted categories or compare similar personal narration/payee strings.    |
| Spending warnings        | Median window comparison; category spikes; IQR/median large-expense threshold  | `apps/api/src/spending-warnings/spending-warnings.detector.ts` | No payee-relative anomaly, recurring amount change, seasonality, or measured alert precision.   |
| Statement reconciliation | Exact type and amount, within one calendar day; independent best match per row | `apps/api/src/bills/statement-matcher.ts`                      | Independent ranking can turn a globally solvable set into ambiguity; description is unused.     |
| Recurring transactions   | User-authored rules materialized nightly                                       | `apps/api/src/recurring/`                                      | No detection of recurring streams from posted history and no accept/reject feedback.            |
| Reports and dashboard    | Monthly rollups and IST daily cash-flow totals                                 | `apps/api/src/reports/`, `apps/api/src/dashboard/`             | Historical reporting only; no forecast or uncertainty.                                          |
| Budget progress          | Utilization in basis points; static 80% and 100% alerts                        | `apps/api/src/budgets/budget-progress.ts`                      | No adjustment for day of month, weekday, pay cycle, or historical spend shape.                  |
| Goal plan                | Required monthly contribution or completion at historical average              | `apps/api/src/goals/goal-plan.ts`                              | Does not test whether the contribution is affordable under forecast cash flow.                  |
| Assets/net worth         | Append-only valuations and current aggregate                                   | `apps/api/src/assets/`                                         | No asset cash-flow linkage, so performance returns cannot yet be calculated correctly.          |

## Non-negotiable algorithm rules

These rules follow `AGENTS.md` and should be part of every algorithm review.

1. **Integer paise all the way through.** Observations, forecasts, errors, thresholds, and returned amounts remain integers. Ratios and weights use basis points or parts per million with `bigint` intermediates. Do not convert money to floating point for a statistics library.
2. **Analysis never mutates the ledger.** Detection and forecasting are derived reads. Accepting a detected recurring rule is an explicit, idempotent mutation. A suspected duplicate is staged for review, not deleted.
3. **Version everything.** Normalizers, feature extraction, detectors, cost functions, and forecast models need integer versions. Persist the version with every materialized result so a changed algorithm cannot be confused with an old result.
4. **Abstention is a valid result.** Insufficient history, tied category scores, an unstable cadence, or a reconciliation cost above threshold must return `unknown`/`ambiguous`, not a confident guess.
5. **Explain every result.** API responses should include compact evidence such as matched prior count, cadence residual, amount MAD, baseline median, forecast model, historical error, or reconciliation score components. Do not include raw descriptions in notification payloads.
6. **Tenant isolation is part of correctness.** Training, features, evaluation, and results are per user. Every repository method takes `userId` first and filters on it. No user's categories, payees, or narrations train another user's model.
7. **Use historical simulation, not in-sample fit, to choose models.** Forecast evaluation must use rolling origins where training data is strictly earlier than the prediction target. This prevents future leakage.
8. **Start with read-only shadow runs.** Materialize results and measure them before showing alerts or enabling acceptance flows.

## Shared foundation: personal narration and counterparty normalization

One versioned normalization pipeline should replace the slightly different text handling that would otherwise grow inside imports, categorization, recurring detection, and reconciliation.

### Proposed output

```ts
type NormalizedTransactionText = Readonly<{
  normalized: string;
  counterpartyKey: string | null;
  paymentRail: "upi" | "neft" | "imps" | "nach" | "card" | "unknown";
  counterpartyHandle: string | null;
  directionHint: "debit" | "credit" | "unknown";
  isFeeHint: boolean;
  isRefundHint: boolean;
  tokens: readonly string[];
  referenceTokens: readonly Readonly<{
    kind: "rrn" | "utr" | "order" | "other";
    value: string;
  }>[];
  normalizerVersion: number;
}>;
```

The actual exported type must be derived from a shared zod schema.

### Deterministic pipeline

1. Unicode-normalize with NFKC and lowercase with a fixed locale-independent operation.
2. Collapse whitespace and punctuation separators.
3. Detect the payment rail from explicit markers such as UPI, NEFT, IMPS, NACH, or card. Rail detection is evidence, not permission to infer a monetary direction that conflicts with the parsed transaction type.
4. Run a versioned rail adapter. UPI handling may extract a VPA/counterparty handle and 12-digit RRN; NEFT/IMPS handling may extract labeled UTR/reference fields; NACH handling should preserve mandate/payee clues. Unknown or bank-specific layouts fall back to the generic parser.
5. Extract long numeric bank/UPI/reference identifiers before removing them. Store the reference kind only when the narration provides enough evidence; otherwise use `other`. References are useful for exact reconciliation but harmful to counterparty similarity.
6. Detect explicit debit/credit, fee/charge, reversal, and refund tokens as hints. The validated CSV amount/type remains authoritative because narrations can be truncated or misleading.
7. Remove known transport noise such as transaction channel prefixes, bank reference labels, PSP suffixes, and long digit runs from the similarity string.
8. Preserve useful payee or payer clues such as UPI handles in a separately normalized form; do not treat every changing UPI reference number as counterparty identity.
9. Produce sorted unique tokens for set similarity. Character n-grams may be added in a later version for misspellings and truncated narrations.
10. Apply a versioned alias map only after the mechanical normalization. Aliases must be user-specific unless they are safe, curated channel tokens.

Example:

```text
UPI/P2M/418923456789/SWIGGY LTD/order 44
  paymentRail: upi
  counterpartyKey: swiggy ltd
  counterpartyHandle: null
  tokens: [swiggy, ltd]
  referenceTokens: [{kind: rrn, value: 418923456789}, {kind: order, value: 44}]
```

Do not overwrite `transactions.description`. The normalized form is derived data and can be recomputed when the normalizer version changes.

NPCI has prescribed Core Banking System narration details for UPI, including a 12-digit RRN, but imported statements can still differ by bank, export format, age, and truncation. Treat the [NPCI UPI narration circular](https://www.npci.org.in/PDF/npci/upi/circular/2018/UPI%20-%20Circular%20No.43.pdf) as the stable rail contract and maintain synthetic fixtures for each supported bank layout. Do not hard-code a universal `UPI/P2M/...` position grammar.

### Implementation change

- Add `apps/api/src/common/transaction-text/normalize-transaction-text.ts` and pure unit tests.
- Put generic parsing and small versioned `upi`, `neft`, `imps`, and `nach` adapters behind one interface. A saved import mapping may optionally identify its source bank; otherwise auto-detection must be conservative.
- Make `imports/dedupe-hash.ts`, `category-rules`, `bills`, and future detectors consume this shared function rather than import one another.
- Do not persist normalized text in v1. At personal-finance scale it is cheap to derive for bounded queries. Persist only after profiling shows a real query budget problem.

## Algorithm 1: personal-history category suggestions

### Why this approach

Personal bank narrations are short, noisy, and often abbreviated. Research on personal banking-description classification reports value from a two-stage similarity plus classifier design, including Jaccard similarity. TreasuryOps should learn only from the owner's prior corrections and explicit rules; cross-user learning would introduce privacy and tenancy risk without helping the core personal-finance goal. A local cascade is the right first implementation.

Source: [personal banking-description Jaccard/SVM study](https://arxiv.org/abs/2404.08664).

### Recommended cascade

Run stages in this order and stop at the first stage that exceeds its calibrated confidence threshold:

1. **Explicit user rule:** preserve the current longest-pattern-wins behavior. User intent outranks learned history.
2. **Exact personal counterparty memory:** for the same `userId`, transaction type, and `counterpartyKey`, count the categories on the owner's prior non-reversed transactions. Suggest the top category only when there are at least three examples, its share is at least a calibrated threshold, and it leads the runner-up by at least two observations.
3. **Approximate personal payee/payer match:** after an exact `counterpartyKey`, compare short names from the owner's narrations with deterministic Jaro or Jaro-Winkler basis-point similarity. Prefix weighting is useful for truncated bank narrations, but cap the prefix bonus and require shared non-noise characters so common rail prefixes do not create false matches.
4. **Soft token match:** use a small-data Soft TF-IDF score only over the owner's history: weight rare personal-corpus tokens more heavily and allow two tokens to match when their Jaro-Winkler score exceeds a calibrated threshold. Calculate document-frequency weights and all similarity contributions in fixed-point integers. This is a private string-matching helper for recognizing repeated personal expenses or income sources, not a general entity-resolution or merchant-intelligence system. Source: [Cohen, Ravikumar, and Fienberg's name-matching study](https://dl.icdst.org/pdfs/files/c2ff48502393a2e9128de3ca6e75cb47.pdf).
5. **Nearest personal narration:** retain plain token Jaccard as a cheap, transparent baseline and fallback:

   ```text
   similarityBps = |A intersect B| * 10_000 / |A union B|
   ```

   Compare with cross multiplication or `bigint`; do not use floating point. Restrict candidates by transaction type and at least one shared meaningful token. Vote among the top neighbors with similarity as an integer weight.

6. **Abstain:** leave uncategorized when confidence is low, the corpus is too small for stable IDF weights, or category kinds conflict.

The first release should suggest, never auto-apply. Accepted or corrected suggestions become ordinary transaction category history and improve later results. Store suggestion provenance in operational metadata only if product analytics needs it; do not modify monetary fields.

### Required changes

- Replace the single-function call site with a `CategorySuggestionService` and a pure `rankCategorySuggestions()` function.
- Add shared integer-scored Jaro/Jaro-Winkler and Soft TF-IDF helpers under `common/transaction-text/`; test symmetry, bounds, empty strings, Unicode normalization, prefix caps, and exact-match score.
- Add a repository query bounded by `userId`, type, and a configurable history limit. It should return only fields needed for features.
- Extend shared response schemas with `categoryId`, `confidenceBps`, `method`, `evidenceCount`, and `algorithmVersion`.
- Add feedback metrics: suggested, accepted unchanged, corrected, and dismissed. Raw descriptions must not go to logs or notifications.
- Keep category updates as explicit, audited non-monetary mutations.

### Release gate

- Offline chronological evaluation: hide the newest labeled transaction, learn only from older transactions, then score top-1 precision and coverage.
- Compare explicit-rule + exact-memory + Jaccard against the added Jaro-Winkler/Soft TF-IDF stages. Promote the more complex stage only when it improves chronological decision metrics and stays within its worker row/time budget.
- Report precision and coverage together. A system with 99% precision at 1% coverage is not useful, and 90% coverage with poor precision destroys trust.
- Initial UI release requires high precision on a manually reviewed local fixture; automatic application is out of scope.

## Algorithm 2: recurring inflow and outflow detection

### User value

Detected salary, rent, utilities, EMIs, and subscriptions turn transaction history into an expected cash-flow calendar. Mature streams can also identify a missed bill or an unexpected price increase.

Plaid's public recurring-transaction contract is a useful product benchmark: it exposes frequency, first/last date, average and last amount, predicted next date, transaction membership, active state, and maturity; it recommends roughly 180 days of history for best results and treats three occurrences as mature in ordinary cadences. This does not reveal Plaid's algorithm and should not be represented as one. Source: [Plaid recurring transaction API](https://plaid.com/docs/api/products/transactions/#transactionsrecurringget).

### Candidate generation

1. Query at most the previous 12 months of posted, non-transfer transactions for one user in the ordinary worker path. Six months is the minimum target for common monthly streams; an explicitly bounded 24-month path may evaluate annual streams. Persist rows scanned and runtime so the home-LXC budget is measurable.
2. Partition by transaction type and the owner's normalized counterparty key. Account ID is a feature, not always a hard partition, because a user can move a subscription between cards.
3. Split a counterparty group when amounts or narration tokens clearly form separate personal streams, such as a subscription and an unrelated one-off payment to the same payee.
4. Test calendar cadences: weekly, biweekly, semi-monthly, monthly, quarterly, and annual. Monthly matching must use calendar-month stepping with end-of-month semantics, not a fixed 30-day duration.

### Cadence score

For each cadence, align each observation to the nearest expected date and calculate:

- `coverageBps`: observed expected slots divided by eligible slots;
- `dateStabilityBps`: penalty from the median absolute day residual;
- `amountStabilityBps`: penalty from `median(|amount - medianAmount|)` relative to median amount;
- `textStabilityBps`: median token similarity to the stream's representative personal narration;
- `missPenaltyBps`: penalty for recent expected occurrences with no matching transaction.

Use a versioned integer-weighted score whose weights sum to 10,000. The initial weights are hypotheses to calibrate, not financial truths. Prefer the highest-scoring cadence only if it beats both an absolute threshold and the second-best cadence by a safety margin.

Variable utilities may have high amount MAD but excellent date stability. Fixed subscriptions should require both. Keep a `fixed`, `variable`, or `unknown` amount behavior in the evidence rather than rejecting all variable streams.

### Stream state

```text
candidate -> mature -> stale
    |           |
 rejected    user-confirmed
```

- `candidate`: two credible occurrences, displayed only in a review surface.
- `mature`: normally at least three occurrences with stable cadence.
- `stale`: no match after the predicted date plus cadence-specific grace.
- `rejected`: user feedback suppresses the same versioned fingerprint until materially new evidence arrives.
- `user-confirmed`: may be converted into an existing recurring rule through an explicit idempotent endpoint.

Detection must never materialize future ledger transactions by itself. Only a user-confirmed recurring rule uses the existing materializer.

### Stream change points and regime versions

A mature stream needs to distinguish a one-off outlier from a persistent amount change such as a subscription increase or restructured EMI. Run change detection only after the ordinary robust amount check has enough post-maturity observations:

1. Build signed deviations in paise from the stream's current median.
2. Maintain upper and lower tabular CUSUM accumulators with integer reference allowance `kMinor` and decision threshold `hMinor`:

   ```text
   upper_t = max(0, upper_(t-1) + deviation_t - kMinor)
   lower_t = min(0, lower_(t-1) + deviation_t + kMinor)
   ```

3. Require the threshold to be crossed persistently and enforce minimum observations on both sides. Calibrate `kMinor` and `hMinor` from stream MAD plus an absolute paise floor; zero MAD must use a documented fallback.
4. On confirmation, close the old derived stream version and create a new version whose baseline starts at the detected point. Never rewrite member transactions or silently edit an accepted recurring rule.
5. Surface “this recurring amount appears to have changed” with old/new medians, absolute delta, and change date. User confirmation may update future recurring-rule materializations only; any correction to an already posted ledger amount still requires reversal and reposting.

CUSUM is a lightweight first implementation; NIST documents its cumulative-sum parameters and threshold behavior. PELT can later segment longer histories exactly with pruning, but it adds penalty/cost-model choices that must beat CUSUM on labeled data before adoption. Sources: [NIST CUSUM](https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc323.htm) and [Killick, Fearnhead, and Eckley's PELT paper](https://arxiv.org/abs/1101.1438).

### Required changes

- Add a new `recurring-detection` module; do not place discovery logic in the existing materializer service.
- Add additive tables `detected_recurring_streams` and `detected_recurring_stream_members`, both tenant-scoped. Persist representative key, cadence, amount median/MAD, confidence, next expected date, state, detector version, and input watermark. Members link existing transaction IDs; they do not copy money.
- Add a unique `(user_id, fingerprint, detector_version)` index and cursor indexes for list endpoints.
- Model algorithm-created stream revisions as versioned derived records with `supersedes_stream_id` or equivalent provenance; retain user accept/reject feedback across compatible versions.
- Run detection in BullMQ. A worker-only `system*` discovery method may find users needing refresh, but all history reads and result writes after discovery must take the discovered `userId` first.
- Add `GET /api/v1/recurring/detected` plus accept/reject endpoints. Accepting creates a recurring rule through existing service boundaries, with an `Idempotency-Key` and `withTxn` for the mutation/audit/outbox work.

### Release gate

- Build a labeled fixture containing weekly, month-end, salary-on-working-day, variable utility, changed-card, skipped-month, and two streams involving the same personal counterparty.
- Optimize first for precision of `mature`, then coverage. False positives are more damaging than abstention.
- Parallel acceptance test: five identical accept requests create exactly one recurring rule.

## Algorithm 3: cash-flow forecast with honest uncertainty

### Forecast the decision, not an abstract series

The product question is: **given liquid balances, known bills/income, and normal variable spending, what range of liquid cash is plausible over the next 30, 60, and 90 days?**

Do not forecast raw total expenses alone. Decompose cash flow:

```text
future liquid cash
  = current spendable balances
  + confirmed recurring inflows
  - confirmed recurring outflows
  - credit-card bills due
  + forecast variable income
  - forecast variable expense
```

Exclude transfers from household income/expense. Treat reversal pairs consistently with existing reporting semantics. Exclude investment accounts and credit-card available credit from liquid cash. A credit-card payment is a liquid cash outflow at its due date; card purchases must not then be counted a second time in the same cash forecast.

### Candidate models

Start with cheap baselines and let rolling-origin evaluation choose per user:

1. **Seasonal naive:** same weekday from the prior week, or same calendar position from the prior month for monthly aggregates.
2. **Trailing median:** median of the previous 4–8 comparable periods. This is robust to one-off purchases.
3. **Fixed-point simple exponential smoothing:**

   ```text
   level_t = round((alphaBps * y_t + (10_000 - alphaBps) * level_(t-1)) / 10_000)
   ```

   Search a small fixed grid of `alphaBps`; use `bigint` for the numerator and a shared signed rounding helper.

4. **Damped trend only after evidence:** a fixed-point damped Holt model can be added if it consistently beats the baselines. Personal spending history is short and regime changes are common, so a trend model should not be assumed better.
5. **Sparse personal-spending candidates:** some personal categories have long zero runs after recurring payments are removed—for example, medical, travel, home repair, or occasional shopping. Measure `nonZeroCount`, zero-share, and the average interval between spend events before enabling this family. Then backtest:

   - **Croston:** smooth non-zero amount size and the integer interval between non-zero observations separately, then divide the size estimate by the interval estimate;
   - **SBA:** apply its fixed-point bias adjustment to the Croston estimate;
   - **TSB:** smooth occurrence probability every period and non-zero amount size only on non-zero periods, then multiply the two fixed-point estimates. Because the probability decays through long zero runs, TSB can adapt when a spending category goes quiet.

   These methods originated in inventory forecasting, but TreasuryOps would borrow only their sparse-series mathematics for the owner's irregular expenses. There is no inventory, product-demand, or business-planning feature. Store smoothing parameters in basis points, use `bigint` intermediates, and return integer paise. Croston is known to be biased and does not provide algebraic prediction intervals, so it is a comparator, not a privileged default. Sources: [Croston mechanics and limitations](https://otexts.com/fpp3/counts.html) and [TSB behavior during extended zero periods](https://www.sciencedirect.com/science/article/pii/S0925527318300562).

Forecast variable daily expenses after removing recognized recurring streams and credit-card double-counting. Start at the total-variable-spend level. Category-level forecasts are sparse and must not ship until their sum is reconciled to the total forecast.

If category forecasts are later exposed, they must be coherent: child/category amounts must sum exactly to their parent and total variable-spend forecast. Start with an integer bottom-up or fixed-point proportional reconciliation. More advanced minimum-trace reconciliation uses covariance matrices and should wait until there is enough data and an audited fixed-point/matrix design. Source: [hierarchical forecast reconciliation](https://otexts.com/fpp3/reconciliation.html).

Forecasting literature recommends time-series cross-validation, where every test observation occurs after its training observations, and stresses that point forecasts without intervals hide material uncertainty. Exponential smoothing is fast and broadly useful, but no method is best for every task. Sources: [rolling-origin evaluation](https://otexts.com/fpp3/tscv.html), [exponential smoothing](https://otexts.com/fpp3/expsmooth.html), [Holt trend](https://otexts.com/fpp3/holt.html), and [prediction intervals](https://otexts.com/fpp3/prediction-intervals.html).

### Evaluation and model selection

For each eligible user:

1. Build chronological daily or weekly aggregates in IST.
2. Use expanding rolling origins and evaluate the actual horizons the UI exposes.
3. Calculate MAE in paise and MASE relative to the seasonal-naive forecast. Avoid MAPE because zero-spend days make it undefined or unstable. [Forecast accuracy reference](https://otexts.com/fpp2/accuracy.html).
4. For intermittent series, also calculate event-occurrence and amount errors. Per-period aggregate errors alone can favor unhelpful zero forecasts, so evaluate whether the model predicts the cash decision and non-zero events.
5. Pick the simplest candidate with the best out-of-sample error, subject to a minimum number of origins. If history is insufficient, return known scheduled cash flow only and mark variable spending `insufficient_history`.
6. Store error metrics and the baseline comparison with the snapshot.

### Prediction ranges without floating-point money

Use empirical rolling-origin residuals for each horizon:

- point forecast: selected model's integer forecast;
- lower/upper variable-spend bounds: exact discrete residual quantiles added to the point forecast;
- liquid-cash risk band: invert expense uncertainty so the conservative cash bound uses the higher expense quantile and lower income quantile;
- clamp forecast expense to zero, but retain the unclamped diagnostic for evaluation.

Use the existing discrete-percentile style instead of interpolating between paise values. Do not label a range “80%” until backtesting demonstrates approximately that empirical coverage. Initially label it “historical range” and expose its observed coverage.

### Conformal calibration candidate

An online conformal layer can wrap any chosen point model by maintaining recent absolute forecast errors in paise and selecting a discrete calibration quantile. It is worth testing because the product acts on the conservative cash bound, not just the point forecast.

Do not claim a distribution-free finite-sample guarantee from ordinary split conformal on this time series: sequential residuals are not generally exchangeable, and regime shifts can invalidate stale scores. Keep empirical residual ranges as the baseline, then compare a bounded rolling/weighted conformal calibration and, only later, a change-point-aware method. The 2025 CPTC work explicitly addresses online conformal prediction under time-series change points, but its state model is research complexity that must demonstrate better held-out coverage and shortfall decisions before implementation. Source: [Conformal Prediction for Time-series Forecasting with Change Points](https://proceedings.neurips.cc/paper_files/paper/2025/hash/12271b64c483ad8f6192eb6aaa102044-Abstract-Conference.html).

Whichever calibration wins must publish empirical coverage, average interval width, under-coverage during detected regimes, calibration-window size, and version. Coverage without useful interval width is not success.

### Required changes

- Add an `insights/forecasting` module with pure model functions and a tenant-scoped repository.
- Add immutable `cashflow_forecast_snapshots`: `user_id`, `as_of`, `horizon_days`, `model_version`, `input_watermark`, point/range JSON parsed with zod, backtest metrics, and `computed_at`. A unique user/as-of/version/horizon key makes retries safe.
- Run computation in BullMQ; nothing slow belongs in `withTxn`.
- Add `GET /api/v1/insights/cash-flow-forecast?days=30|60|90`.
- Render point and range through the generated client. The UI must show `asOf`, history sufficiency, model label, and observed error/coverage in plain language.
- Write a notification-outbox record only for a conservative projected shortfall that remains across consecutive runs; dedupe by user, forecast version, affected date, and severity.

### Release gate

- The chosen model must beat or match seasonal naive on median user MASE and must not create a materially worse high-error tail.
- Croston/SBA/TSB are eligible only for series that meet the versioned intermittency rule and must beat both a zero-aware naive baseline and SES/median alternatives on the decision horizon.
- Range coverage is measured by horizon. Do not market an 80% range if only 55% of held-out observations land inside it.
- A conformal candidate must improve coverage error or shortfall-warning utility without making ranges operationally useless; otherwise retain empirical residual quantiles.
- Fixture tests include payday, month end, February/leap day, IST/UTC boundary, skipped recurring payment, reversal, transfer, and a credit-card purchase/payment pair.

## Algorithm 4: calendar-aware budget pacing

The current 80% and 100% utilization states answer “how much is spent?” but not “is this pace unusual for this point in the month?”

### Historical spend curve

For each category and each complete prior month with enough transactions:

1. Calculate cumulative spend at each IST calendar day.
2. Express it in basis points of that month's final category spend:

   ```text
   cumulativeShareBps(day) = cumulativeMinor(day) * 10_000 / finalMonthMinor
   ```

3. For the current month's normalized position, use the discrete median share across eligible months. Normalize 28/29/30/31-day months by basis points of month elapsed, while retaining explicit month-end behavior.
4. Calculate a robust band using the historical discrete quartiles or MAD.
5. Compare actual spend with both the budget limit and historical pace.

Useful outputs:

- `expectedSpentMinor` at today's historical pace;
- `paceDeltaMinor` and `paceRatioBps`;
- `projectedMonthEndMinor = spentMinor * 10_000 / max(expectedShareBps, floorBps)`;
- `projectedUtilizationBps`;
- `historyMonths` and `confidence`.

Fallback to linear calendar pacing when fewer than three eligible months exist, and label it clearly. Never fire a pace alert in the first few days from a tiny denominator. Keep the existing hard 80%/100% alerts; pace is an additional signal, not a replacement.

### Required changes

- Add pure pace functions in `budgets/`; reuse monthly rollups only if they contain the required daily curve, otherwise query bounded daily totals.
- Extend shared budget schemas and OpenAPI responses, then regenerate the client.
- Version pace policy separately from the existing hard-threshold policy.
- Use deterministic notification fingerprints based on budget, IST month, policy version, and pace band.

### Release gate

- Backtest each historical month using only earlier months and measure how often “overspend projected” correctly predicts month-end budget breach.
- Do not enable notifications until precision is acceptable; showing an informational projection in the UI can ship earlier.

## Algorithm 5: global reconciliation and safer duplicate detection

### Statement reconciliation upgrade

The existing matcher finds the best candidate for each row and then marks reused best candidates ambiguous. A minimum-cost bipartite assignment considers all rows and ledger transactions together, guaranteeing that a statement row and a transaction are each used at most once.

The linear assignment problem minimizes total cost over a one-to-one pairing. [SciPy's algorithm documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.linear_sum_assignment.html) gives the formal problem and notes rectangular matrices, which are useful because unmatched rows are allowed.

Candidate blocking should remain strict:

- same user, bill/account scope, transaction type, and exact `amountMinor`;
- date within a configurable small window;
- exclude already claimed transactions;
- use description similarity only to rank candidates, never to override amount/type incompatibility.

Example integer cost:

```text
cost = dateDistanceDays * dateWeight
     + (10_000 - tokenSimilarityBps) * textWeight
     + sourcePenalty
```

Add a dummy unmatched option with a calibrated cost. Accept a match only when its cost is below the threshold and the alternative assignment margin is large enough; otherwise return `ambiguous`. Persist score components for explanation.

Do not add a numerical dependency solely for this. Implement and test a bounded rectangular assignment solver in TypeScript, or use a sparse augmenting-path algorithm if statement sizes make a dense matrix too large. The statement parser already runs in a worker, which is the correct execution boundary.

### Duplicate detection v2

Keep the exact hash as the fast first tier, but introduce a versioned v2 fingerprint that includes transaction type:

```text
sha256(userId | accountId | type | IST-day | amountMinor | normalizedTextV2)
```

Do not reinterpret stored v1 hashes in place. Store or calculate the fingerprint version and maintain compatible lookup during staged migration.

For near duplicates, block on user/account/type/exact amount and a narrow date range, then score:

- exact extracted bank reference: strongest evidence;
- same normalized personal counterparty key;
- token Jaccard similarity;
- calendar-day distance;
- source pair, such as manual followed by CSV import.

Near duplicates must be review flags. Repeated same-day purchases of the same amount to the same payee can be legitimate, so approximate matching must never silently exclude or reverse them.

### Release gate

- Reconciliation fixtures include repeated equal amounts, swapped row ordering, two rows competing for two transactions, descriptions missing on one side, and unmatched dummy assignments.
- Dedupe fixtures include expense/income same amount, two legitimate identical purchases, changed UPI references, midnight IST/UTC boundaries, and manual/import copies.
- A parallel import test still proves one ledger effect under at least five identical attempts.

## Algorithm 6: robust anomaly detection v2

The current detector already makes the right foundational choice: median and discrete quartiles are safer for skewed personal spending than a mean plus standard deviation.

NIST recommends robust statistics when outliers affect ordinary estimates and documents the modified z-score:

```text
modifiedZ = 0.6745 * (x - median) / MAD
```

NIST suggests labeling absolute modified z-scores above 3.5 as potential outliers, while also warning that outlier labeling depends on distribution assumptions. TreasuryOps should implement the equivalent with scaled integers and treat it as a review signal, not proof of fraud. Sources: [NIST outlier detection](https://www.itl.nist.gov/div898/handbook/eda/section3/eda35h.htm) and [robust measures of scale](https://www.itl.nist.gov/div898/handbook/eda/section3/eda356.htm).

### Worthwhile additions

1. **Personal payee-relative large expense:** compare an expense with the owner's prior amounts for the same counterparty key before falling back to category. This can catch a subscription price jump without comparing it with unrelated spending in the same category.
2. **Recurring amount change:** for a mature fixed stream, compare the latest amount to stream median and MAD. Require both an absolute-paise floor and a relative basis-point threshold.
3. **New counterparty + high amount:** only if the amount is also extreme relative to the category and the owner's overall history. This is low-confidence and should remain informational.
4. **Change-point persistence:** an EWMA can detect a sustained shift, but add it only after one-off robust warnings are measured. NIST describes EWMA as giving exponentially decreasing weight to older observations. [NIST EWMA reference](https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc314.htm).
5. **Regime-aware reset:** feed a confirmed stream CUSUM change into the recurring baseline and forecast input watermark. For aggregate variable spending, evaluate bounded CUSUM first; PELT or Bayesian online change-point detection remains research-only until it wins on synthetic and held-out regime-shift fixtures. A detected point creates a new derived regime version rather than deleting old analysis.

Do not call these warnings “fraud detection.” TreasuryOps lacks authorization, device, counterparty, card-present, location, and bank-risk features. The product can say “unusual for your history.”

### Required changes

- Extract reusable discrete median, quantile, MAD, and basis-point ratio helpers into `common/statistics/`, with integer inputs/outputs.
- Add detector versions and evidence schemas for personal counterparty anomaly and recurring amount change.
- Add reusable fixed-point CUSUM primitives with explicit minimum-segment length, warm-up, and reset behavior. Keep anomaly and recurring policies separate even when they share the primitive.
- Record dismiss/confirm feedback without storing raw narration in the warning evidence.
- Measure alert rate and user-confirmed usefulness by detector kind before changing notification severity.

## Algorithm 7: goal feasibility and safe surplus allocation

`calculateGoalPlan()` already computes the required monthly contribution for a target date. Extend it by comparing required contribution with a conservative forecast of monthly free cash:

```text
freeCashMinor
  = forecast income
  - essential recurring outflows
  - credit-card bills due
  - variable expense forecast
  - user-selected safety buffer
```

Return:

- required monthly contribution;
- conservative available contribution;
- monthly gap or surplus;
- projected completion range, not only a single date;
- assumptions and forecast snapshot ID.

For multiple active goals, offer deterministic simulations rather than an opaque optimizer:

1. priority order;
2. earliest target date first;
3. proportional to remaining target;
4. user-entered fixed contributions.

Use a water-filling loop in paise: allocate required minimums in order, then distribute remaining forecast surplus according to the selected policy. Never move money automatically and never count a credit-card limit as available savings.

The CFPB describes cash flow as the timing of money in and out and notes the role of reserve savings in absorbing financial shocks. This supports showing a safety buffer rather than allocating every forecast rupee to goals. Source: [CFPB emergency-fund guide](https://www.consumerfinance.gov/an-essential-guide-to-building-an-emergency-fund/).

The safety buffer is a first-class personal setting, not a hidden constant. Let the user choose an absolute liquid amount, a number of essential-expense months, or a linked emergency-fund goal. Version the effective setting and store that version in every feasibility result. If the conservative cash path falls below the buffer, the UI should show the gap before suggesting additional goal contributions.

### Required changes

- Add an effective-dated user preference for a liquid safety buffer or emergency-fund goal; validate it through the shared schema and record its version in the forecast/goal evidence. Environment configuration is not involved.
- Extend `GoalPlanSchema` with forecast-linked feasibility fields in a backward-compatible API addition.
- Keep the goal calculation pure; fetch the selected forecast in the service.
- Present scenarios as user choices, not advice that one allocation is universally optimal.

## Algorithm 8: debt payoff simulation, but only after data readiness

Debt payoff is useful, especially with the existing credit-card bill module, but it is unsafe to implement from balance and due date alone. Many issuers calculate interest from daily or average daily balances; cards can have different APRs for different balance types, grace periods, promotional rates, minimum finance charges, and issuer-specific payment allocation. Sources: [CFPB explanation of card interest](https://www.consumerfinance.gov/ask-cfpb/how-does-my-credit-card-company-calculate-the-amount-of-interest-i-owe-en-51/) and [CFPB repayment-disclosure assumptions](https://www.consumerfinance.gov/rules-policy/regulations/1026/2024-01-01/m1/).

### Data needed first

Add effective-dated, append-only card terms rather than mutable columns:

- purchase APR basis points and compounding method;
- cash-advance/balance-transfer APR only if those balances are separately tracked;
- grace-period policy;
- minimum-payment formula and minimum amount;
- annual/late fees;
- promotional balance, APR, start, and end dates;
- statement-provided minimum due and interest charged.

Without these fields, only show a simple user-entered what-if calculator explicitly labeled as an approximation.

### Later algorithm

Simulate day by day in paise using rational APR arithmetic and issuer terms, apply minimums, then compare:

- highest-interest-first (avalanche), which usually minimizes interest cost;
- smallest-balance-first (snowball), which prioritizes visible account completion;
- user order.

The CFPB documents both strategies and their trade-off. Source: [CFPB debt reduction strategies](https://www.consumerfinance.gov/archive/blog/how-reduce-your-debt/).

The simulator is decision support. It must show total payments, total modeled interest, payoff date, assumptions, and a warning when issuer terms are incomplete.

## Algorithms to defer or reject

### Do not build now

| Idea                                           | Reason                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM-based transaction categorization           | Non-deterministic, costly, difficult to evaluate, may expose sensitive descriptions, and unnecessary before private personal-history matching is measured.                                                                                                                                                                                                                                                                                                          |
| Cross-user collaborative categorization        | Creates tenancy/privacy risk and needs a consent, anonymization, retention, and model-governance design that this personal deployment does not need.                                                                                                                                                                                                                                                                                                                |
| Prophet/ARIMA as the first forecast            | More parameters and dependencies do not create signal. Short, sparse, changing personal histories need strong baselines and honest evaluation first.                                                                                                                                                                                                                                                                                                                |
| Isolation Forest or neural anomaly model       | Hard to explain and validate with one user's small dataset; current robust statistics are a better fit.                                                                                                                                                                                                                                                                                                                                                             |
| Monte Carlo cash-flow simulation               | Sampling does not fix a poor model. Add only after residual distributions and correlations are calibrated; deterministic empirical quantile paths are sufficient first.                                                                                                                                                                                                                                                                                             |
| Portfolio optimization/rebalancing             | Asset quantity, acquisition cost, disposal, fee, tax, risk preference, and external cash-flow data are incomplete. Recommendations would be misleading.                                                                                                                                                                                                                                                                                                             |
| TWR/MWR/XIRR performance display               | Current valuations are not linked to external contributions/withdrawals. CFA materials distinguish time-weighted returns, which remove external-flow effects, from money-weighted returns, which include their timing and size; TreasuryOps cannot calculate either faithfully yet. [CFA GIPS introduction](https://rpc.cfainstitute.org/sites/default/files/docs/codes-and-standards/introduction-to-the-gips-standards-for-asset-owners_requirements_online.pdf). |
| “Financial health score” from transaction data | A single opaque score hides assumptions and can look like regulated credit or financial advice. Show component facts: runway, budget pace, savings buffer, debt cost, and forecast uncertainty.                                                                                                                                                                                                                                                                     |
| Fraud detection                                | The app lacks the network, device, authorization, location, and counterparty-risk features necessary for a credible fraud system. Use “unusual for your history.”                                                                                                                                                                                                                                                                                                   |

## Proposed architecture and additive data model

Do not create one giant “AI service.” Keep pure algorithms next to their domain and share only genuinely reusable primitives.

```text
apps/api/src/common/
  statistics/                 discrete quantile, median, MAD, fixed-point ratios
  transaction-text/           versioned personal narration/counterparty normalization
apps/api/src/category-rules/   personalized suggestion cascade
apps/api/src/recurring-detection/
apps/api/src/insights/forecasting/
apps/api/src/bills/            assignment matcher upgrade
apps/api/src/budgets/          pacing model
apps/api/src/spending-warnings/ detector v2
apps/api/src/goals/            forecast-linked feasibility
packages/shared/src/           zod schemas and derived API types
```

Suggested tables, added only in the feature PR that needs them:

| Table                               | Purpose                                                              | Important constraints                                                             |
| ----------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `detected_recurring_streams`        | Current materialized detected streams and feedback state             | Tenant-scoped; versioned fingerprint unique per user; no ledger mutation.         |
| `detected_recurring_stream_members` | Explain which posted transactions formed a stream                    | Tenant-scoped; unique stream/transaction; transaction ownership integration test. |
| `cashflow_forecast_snapshots`       | Immutable forecast, bounds, input watermark, and backtest metrics    | zod-validated JSON; retry-safe unique key; cursor index by user/computed time.    |
| `algorithm_feedback_events`         | Optional append-only accept/reject/dismiss events across suggestions | No raw narration; tenant-scoped; event kind and algorithm version validated.      |
| `credit_card_term_versions`         | Later: effective-dated terms for debt simulation                     | Append-only and linked to user/account; never overwrite historical terms.         |

Avoid a table for every intermediate feature. Recompute bounded features until profiling proves persistence is necessary. If cached features are added later, include `input_updated_at`/watermark and the feature version so stale data is observable.

Every worker algorithm must declare and test a resource contract: `lookbackDays`, `maxRows`, batch size, expected complexity, timeout, and degraded/abstain behavior. Recurring detection defaults to 12 months with an explicit 24-month annual-stream path; other limits must be chosen from profiling on the home LXC. If a user exceeds a row budget, paginate/resume or return `resource_limit` evidence—never silently scan unbounded history or truncate without disclosure.

## API and UI behavior

- Routes remain under `/api/v1/`; controllers only validate, call one service method, and map results.
- All request/response contracts live in shared zod schemas and regenerate the OpenAPI client.
- List endpoints use cursors.
- A suggestion response always includes `confidenceBps`, method, version, and an explanation suitable for UI text.
- A forecast always includes point, range, `asOf`, horizon, data sufficiency, model, historical error, and observed range coverage.
- Mutating accept/reject actions use `Idempotency-Key`. Any action that creates a recurring rule goes through the normal service, `withTxn`, audit, and outbox boundaries.
- Frontend server components remain the default and use only the generated client. Interactive scenario controls may be client components.
- Display all money through `formatMinor()` and all forecast/calendar dates in the established IST-aware utilities.

## Decision-oriented evaluation and personal feedback

Generic accuracy is necessary but not sufficient. Measure whether the feature helps the owner make a better personal-finance decision:

- **Cash shortfall:** precision and recall of a projected negative-liquid-cash event, days of warning, and error in the first shortfall date. Weight a missed near-term shortfall more heavily than a harmless distant false positive.
- **Categorization:** ordinary top-1 precision/coverage plus amount-weighted accuracy, reported alongside the unweighted metric so a few large payments cannot hide poor everyday behavior.
- **Recurring expenses:** precision of mature streams, missed-payment detection lead time, accepted/rejected rate, and error in next-date/next-amount predictions.
- **Budgets:** precision and lead time of projected month-end breaches; avoid rewarding alerts that arrive only after the budget is already exceeded.
- **Goals:** error in affordable-contribution ranges and frequency with which the conservative plan would breach the user's safety buffer.
- **Anomalies:** user-confirmed usefulness, dismiss rate, warning volume, and absolute amount at risk. Never optimize for notification clicks.

Feedback prompts should respect the user's attention. Order an optional review inbox by a transparent `reviewPriorityBps` combining uncertainty, amount significance relative to that user's history, effect on forecast/budget/goal outputs, and staleness. This borrows the useful idea behind active learning—ask about uncertain, consequential examples—but does not train a business or cross-user model. The UI must explain why an item is high priority, permit dismissal, and never block ordinary ledger use.

Every algorithm version follows `shadow -> canary -> active`:

1. Run the candidate in shadow on the same bounded personal histories as the active version; do not show or notify.
2. Compare both versions over complete decision windows, not just in-sample scores.
3. Canary the new version for a small, explicitly selected local cohort or feature flag while preserving instant rollback to the old derived-results reader.
4. Promote only when decision metrics, privacy, runtime, and calibration gates pass. Persist `algorithmVersion`, `policyVersion`, and input watermark with every result.
5. Never run competing versions twice through a money-writing path. Shadow/canary applies only to derived analysis; explicit accepted mutations still use one idempotent service path.

## Testing and evaluation plan

### Pure algorithm tests

- Golden fixtures with explicit input, exact integer output, version, and evidence.
- Property tests where useful: permutation invariance for medians; assignment uniqueness; no negative expense forecast; category confidence within 0–10,000; stream membership uniqueness.
- Boundary fixtures: `Number.MAX_SAFE_INTEGER`, negative cash balance, zero baseline, MAD zero, tied candidates, empty history, leap day, month end, and IST midnight.
- No snapshots for financial numbers unless the expected values are independently stated; tests should make the math reviewable.

### Repository and service tests

- Every query is tenant-scoped and tested against two users with overlapping narration text, counterparties, amounts, and dates.
- Worker discovery returns owner `userId`; subsequent reads and writes use it first.
- Recomputed snapshots are retry-safe and deterministic for the same input watermark and version.
- Accept/reject paths are idempotent under `Promise.all` with at least five attempts.
- Any new money-writing path still ends with `assertInvariants()` in integration/e2e tests.

### Offline evaluation dataset

Create a synthetic, deterministic dataset builder rather than commit real bank descriptions. It should generate:

- monthly salary with working-day shifts;
- rent, weekly groceries, biweekly services, annual membership, variable utility;
- personal payee aliases and changing UPI references;
- one-off travel and medical shocks;
- category corrections;
- repeated equal legitimate purchases;
- missing and delayed transactions;
- transfers, reversals, credit-card purchases, statements, and payments;
- gradual and abrupt spending regime changes.

Keep a separate hand-labeled local fixture out of Git for realistic validation. Report aggregate metrics only.

### Production shadow metrics

- category suggestion precision proxy, coverage, correction rate, and abstention rate;
- recurring candidate accept/reject/stale rates and cadence residual distribution;
- forecast MAE/MASE by horizon and empirical interval coverage;
- shortfall warning precision/recall, lead time, first-shortfall-date error, and interval width;
- reconciliation auto-match, ambiguous, user-corrected, and unmatched rates;
- anomaly alert dismiss/confirm rate and warnings per active user;
- safety-buffer breach rate in generated goal scenarios;
- active-versus-shadow metric deltas by algorithm version, without user identifiers as labels;
- algorithm runtime, rows scanned, row-budget hits, result age, and failure count.

Do not log descriptions, tags, raw CSV cells, account names, or transaction IDs as metric labels.

## Delivery plan

### Phase 0 — measurement and shared primitives

1. Add fixed-point statistics and India-aware personal narration normalization with generic plus conservative UPI/NEFT/IMPS/NACH adapters and golden tests.
2. Add private-history Jaro-Winkler/Soft TF-IDF helpers and fixed-point CUSUM primitives; keep them unused until their domain evaluations pass.
3. Add the deterministic synthetic evaluation builder, rolling-origin harness, and personal decision metrics.
4. Define versioning, evidence, data-sufficiency, resource-budget, safety-buffer, shadow/canary, and abstention contracts in shared zod schemas.
5. Capture baseline metrics for current category rules, statement matcher, and spend warnings before changing them.

### Phase 1 — immediate user value

1. Add personal-history category suggestions behind the existing rule stage.
2. Upgrade bill matching to global assignment and add dedupe v2 in import staging.
3. Build recurring detection in shadow mode, label results, then expose a review/accept flow.
4. Evaluate CUSUM-based recurring-amount regime versions in shadow; show change prompts only after labeled precision passes.
5. Build known-schedule plus variable-spend forecasting, including Croston/SBA/TSB only for eligible sparse personal series, select models by rolling-origin decision error, and expose 30-day forecast first.
6. Compare empirical residual ranges with a simple bounded online conformal calibration in shadow; keep whichever is better calibrated and operationally useful.

### Phase 2 — decisions and warnings

1. Add 60/90-day forecasts after measured horizon accuracy is acceptable.
2. Add calendar-aware budget projections, initially informational.
3. Add personal payee-relative and recurring-amount anomaly warnings.
4. Add goal feasibility scenarios using the conservative forecast and safety buffer.
5. Add transparent impact-and-uncertainty ordering to the optional personal review inbox.
6. Enable regime-aware forecast resets only after shadow comparisons show better shortfall and coverage metrics.

### Phase 3 — only after explicit data-model work

1. Design effective-dated credit-card terms and exact statement-derived balances.
2. Implement transparent debt payoff simulations.
3. Re-evaluate asset cash-flow linkage before any investment-return algorithm.

Each phase is multiple focused PRs. A feature PR may include its required additive drizzle migration, but deployment files remain separate. Every PR must pass the full repository definition of done from `AGENTS.md`.

## Research questions to answer with data, not preference

1. Does private counterparty/narration memory materially outperform the existing longest-rule baseline, and at what coverage?
2. Are transaction descriptions stable enough per bank/import mapping to support one shared normalizer, or are versioned bank-specific adapters needed?
3. What cadence grace windows maximize recurring precision for Indian salary, UPI AutoPay, EMI, and utility patterns?
4. Does removing detected recurring streams improve variable-spend forecast MASE?
5. Is daily or weekly aggregation more accurate for the 30-day cash decision?
6. How many historical months are required before category budget curves beat linear pacing?
7. What reconciliation cost and alternative-margin thresholds minimize user corrections?
8. Which warning types users confirm as useful, and which merely restate obvious large purchases?
9. Can credit-card purchase/payment double-counting be resolved with existing bill links for every supported flow, or is additional attribution needed?
10. What is the maximum bounded row count and runtime for every worker algorithm on the home LXC?
11. Which UPI/NEFT/IMPS/NACH narration fields remain stable across the user's actual bank exports, and which adapters should abstain?
12. Do Jaro-Winkler or Soft TF-IDF improve the owner's category and recurring matches enough to justify their added complexity over exact keys and Jaccard?
13. Which personal spend series are truly intermittent, and do Croston/SBA/TSB improve 30-day cash decisions rather than only generic forecast error?
14. Does CUSUM distinguish persistent recurring-price changes from one-off amounts with acceptable prompt precision?
15. Does online conformal calibration improve held-out coverage and shortfall decisions without making cash ranges too wide to use?
16. Does impact-and-uncertainty review ordering produce more useful corrections with fewer prompts than confidence-only ordering?

## Source notes

These references support method choice and product semantics; they are not copied implementations.

- Hyndman and Athanasopoulos, _Forecasting: Principles and Practice_: [rolling-origin cross-validation](https://otexts.com/fpp3/tscv.html), [exponential smoothing](https://otexts.com/fpp3/expsmooth.html), [Croston mechanics and limitations](https://otexts.com/fpp3/counts.html), [prediction intervals](https://otexts.com/fpp3/prediction-intervals.html), [hierarchical reconciliation](https://otexts.com/fpp3/reconciliation.html), and [forecast accuracy](https://otexts.com/fpp2/accuracy.html).
- NIST/SEMATECH Engineering Statistics Handbook: [outlier detection and modified z-score](https://www.itl.nist.gov/div898/handbook/eda/section3/eda35h.htm), [robust scale](https://www.itl.nist.gov/div898/handbook/eda/section3/eda356.htm), [EWMA](https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc314.htm), and [CUSUM](https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc323.htm).
- NPCI, [UPI Core Banking System narration details](https://www.npci.org.in/PDF/npci/upi/circular/2018/UPI%20-%20Circular%20No.43.pdf).
- García-Méndez et al., [banking transaction description classification with Jaccard similarity and SVM](https://arxiv.org/abs/2404.08664).
- Cohen, Ravikumar, and Fienberg, [TF-IDF/Jaro-Winkler name-matching comparison](https://dl.icdst.org/pdfs/files/c2ff48502393a2e9128de3ca6e75cb47.pdf).
- Babai et al., [TSB behavior during extended zero periods](https://www.sciencedirect.com/science/article/pii/S0925527318300562).
- Killick, Fearnhead, and Eckley, [PELT change-point detection](https://arxiv.org/abs/1101.1438).
- Sun and Yu, [change-point-aware conformal prediction for time series](https://proceedings.neurips.cc/paper_files/paper/2025/hash/12271b64c483ad8f6192eb6aaa102044-Abstract-Conference.html).
- Plaid, [recurring transaction API semantics](https://plaid.com/docs/api/products/transactions/#transactionsrecurringget).
- SciPy, [linear sum assignment problem](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.linear_sum_assignment.html).
- CFPB: [cash flow and emergency savings](https://www.consumerfinance.gov/an-essential-guide-to-building-an-emergency-fund/), [credit-card interest](https://www.consumerfinance.gov/ask-cfpb/how-does-my-credit-card-company-calculate-the-amount-of-interest-i-owe-en-51/), [repayment estimate assumptions](https://www.consumerfinance.gov/rules-policy/regulations/1026/2024-01-01/m1/), and [debt reduction strategies](https://www.consumerfinance.gov/archive/blog/how-reduce-your-debt/).
- CFA Institute, [GIPS introduction distinguishing time- and money-weighted returns](https://rpc.cfainstitute.org/sites/default/files/docs/codes-and-standards/introduction-to-the-gips-standards-for-asset-owners_requirements_online.pdf).

## Final recommendation

Approve Phase 0 and the first three Phase 1 items as the initial program: private personal-narration normalization/statistics, honest decision evaluation, personal category memory, global reconciliation, and recurring-expense detection. Begin the cash-flow forecast once recurring streams can be separated from variable spending and credit-card cash-flow double-counting has an explicit test fixture.

Judge every later technique by whether it helps the owner spend more intentionally, avoid a shortfall, protect a safety buffer, save toward a goal, or reduce debt. That sequence builds reusable personal signal before prediction, measures every improvement against a baseline, and preserves the project's defining property: analytics may be uncertain, but the ledger must never be.
