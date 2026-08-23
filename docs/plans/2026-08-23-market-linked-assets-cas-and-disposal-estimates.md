# Market-linked assets, CAS imports, and disposal estimates — implementation plan

**Status:** Proposed

**Planning date:** 2026-08-23

**Audience:** Backend, frontend, operations, and future maintainers

**Primary goal:** Extend the existing assets module so it can import mutual-fund holdings from Indian CAS statements, maintain positions from append-only events, refresh mutual-fund NAV and precious-metal quotes automatically, materialize daily asset valuations, and show a transparent estimate of cash and post-tax proceeds if the user sells.

**Authoritative constraints:** `AGENTS.md`, integer paise, append-only financial history, `withTxn` for money writes, tenant-scoped repositories, Zod at every boundary, BullMQ for long-running work, additive Drizzle migrations, generated OpenAPI client, cursor pagination, Better Auth, server components by default, and no new dependency without explicit approval.

**Important:** This document is an implementation design, not tax, legal, or investment advice. Provider contracts and Indian tax rules are time-sensitive. Reconfirm them before implementation and again before each tax-rule release.

## 1. Executive decision

This feature is possible, but it should not be implemented as one generic “asset price” field or as a daily CAS download.

Use three deliberately separate flows:

```text
CAS / manual / broker activity       Market-data providers           Tax-rule engine
            │                                  │                           │
            ▼                                  ▼                           ▼
  append-only position events          quote snapshots             disposal simulation
            │                                  │                           │
            └──────────────┬───────────────────┘                           │
                           ▼                                               │
                 daily asset valuations ───────────────────────────────────┘
                           │
                           ▼
                existing net-worth read model
```

The boundaries mean:

- a CAS tells us **what the user owns** and, when sufficient history is present, acquisition dates and costs;
- AMFI or a metal-rate provider tells us **what one unit is worth** at a provider timestamp;
- an asset valuation tells us **what the complete holding was worth** at a point in time;
- the disposal estimator tells us **what cash may settle and what may remain after estimated tax**; and
- none of those writes or simulations silently creates, edits, or deletes an expense-ledger transaction.

The first production release will use manual CAS PDF upload. It will not log in to CAMS, KFintech, MFCentral, CDSL, NSDL, or an email account on the user's behalf. Official CAS generation is periodic and on-demand, not a daily holdings API. A user may request and upload a new CAS whenever needed, but the application should prompt for one after a purchase, SIP, switch, redemption, or during monthly reconciliation—not every day.

Daily value changes require only a quote refresh because units do not change without a transaction. Physical-metal values use a clearly labelled indicative spot quote; they are not dealer buyback/appraisal quotes.

## 2. Product scope

### 2.1 In scope

The complete feature will provide:

1. exact mutual-fund scheme selection using AMFI scheme code and ISIN where available;
2. physical-gold and physical-silver position metadata, including weight and purity;
3. append-only unit/weight events for opening positions, purchases, reinvestments, switches, redemptions, reconciliations, and reversals;
4. manual, idempotent CAS PDF upload with asynchronous parsing and a review-before-commit workflow;
5. scheduled AMFI NAV ingestion and one free, indicative physical-metal spot provider;
6. append-only quote snapshots and materialized `asset_valuations` compatible with the existing net-worth calculation;
7. current position, quote source, provider timestamp, fetch timestamp, freshness, and current value on asset detail pages;
8. a read-only disposal estimate for mutual funds, physical gold, physical silver, gold/silver ETFs, and—with separate rules—Sovereign Gold Bonds;
9. a breakdown of gross proceeds, commercial deductions, settlement cash, gain, estimated tax, and estimated post-tax proceeds;
10. explicit assumptions, missing-data warnings, rule version, and confidence on every estimate; and
11. monitoring, retry safety, tenant isolation, audit history, and reconciliation checks.

### 2.2 Non-goals

The initial implementation will not:

- scrape CAPTCHA-protected CAS request forms or automate personal RTA/depository logins;
- promise a daily CAS or treat CAS as a real-time transaction feed;
- use MFAPI.in, Yahoo Finance, or a hardcoded fallback as the sole production source of truth;
- infer an exact mutual-fund plan from a fuzzy name without user confirmation;
- auto-create bank-ledger transactions from CAS rows;
- overwrite an asset quantity to “make it match” a statement;
- edit or delete committed position events, tax-lot history, quotes, valuations, ledger rows, or audit rows;
- provide tax filing, tax-loss harvesting, DTAA, NRI, HUF, trust, company, partnership, business-inventory, or dealer GST accounting;
- guarantee today's mutual-fund redemption NAV before the applicable cut-off and official publication;
- treat physical gold, a gold ETF, a gold fund-of-funds, and an SGB as the same tax instrument;
- calculate investment performance from value change alone when contributions or withdrawals occurred;
- execute purchases or sales; or
- introduce a microservice. This remains a modular NestJS application with BullMQ workers.

## 3. Success criteria

The feature is complete only when all of the following are true:

- A user can create or link an asset to an exact market instrument without manually entering its NAV every day.
- A user can upload a supported password-protected CAS, review the normalized rows, resolve uncertain matches, and commit once.
- Re-uploading the same file or retrying the same commit creates exactly one financial effect.
- A second, regenerated PDF containing the same statement data is detected semantically even if its bytes differ.
- Current position is reproducible from append-only position events.
- Existing physical-metal quantities are backfilled without dropping or renaming a live column.
- The scheduled worker stores only validated, fixed-point quotes and never performs network I/O inside a database transaction.
- A quote retry for the same provider instrument and provider timestamp creates at most one quote and one valuation per asset.
- An unavailable provider leaves the last-known valuation visible with a stale warning; it never writes a fabricated fallback price.
- Net worth continues to use the latest `asset_valuations` row and needs no provider call in the request path.
- A disposal estimate can be reproduced from its request, quote, rule version, and lots, and clearly reports when tax cannot be estimated.
- No API response exposes another user's asset, position, CAS row, folio, or estimate inputs.
- All required lint, typecheck, unit, integration, and route/auth tests pass.

## 4. Current baseline and gaps

| Area | Current behavior | Required change |
|---|---|---|
| Asset kinds | `loan_receivable`, `loan_liability`, `fixed_deposit`, `gold`, `silver`, `investment` | Keep these stable; use market-link instrument metadata to distinguish mutual fund, ETF, SGB, and physical metal. |
| Metal quantity | `quantityMilliUnits` is allowed only for gold/silver | Preserve as a compatibility cache; make append-only position events authoritative for market-linked assets. |
| Investment quantity | No unit model for `investment` | Add position events using micro-units without widening the asset row into a mutable holding record. |
| Valuations | Manual or maturity projection | Add `market_sync`, quote provenance, and deterministic source references. |
| Metal prices | On-demand Yahoo futures + USD/INR, 15-minute memory cache, hardcoded fallback | Move production ingestion to provider adapters and persisted quotes; keep Yahoo only as an explicitly labelled prototype if retained. |
| Mutual-fund NAV | Not supported | Add AMFI daily batch ingestion and an optional MFAPI convenience adapter. |
| Asset funding | Tracks ledger funding amount and transaction, not units | Add optional position details and create funding + position event atomically. |
| Imports | Transaction CSV staging/commit workflow | Reuse patterns, not tables; add a separate portfolio-import module for sensitive PDF and holdings semantics. |
| Net worth | Latest asset valuation plus active contributions after it | Continue materializing valuations so this read model remains fast and provider-independent. |
| Returns | Opening/latest value comparison is not contribution-adjusted | Label as value change until full cash-flow history supports money-weighted returns. |
| Taxes | No disposal simulation | Add a versioned, fixed-point, read-only estimator with explicit scope and assumptions. |

## 5. Domain model

### 5.1 Keep asset identity separate from position and price

`net_worth_assets` remains the durable user-facing asset identity. It stores the name, asset kind, dates, and existing metadata. It must not become a daily market-price row.

For V1:

- `gold` and `silver` mean physical metal;
- mutual funds, gold/silver ETFs, gold fund-of-funds, and SGBs remain `investment` assets; and
- `asset_market_links.instrumentType` carries the precise product type needed for quote and tax behavior.

This avoids a breaking expansion of `asset_kind` while still preventing tax rules from being inferred from a display name.

### 5.2 Fixed-point conventions

No provider float may enter money math.

Use these shared representations:

```text
quantityMicroUnits              = units or grams × 1,000,000
priceMicroRupeesPerQuoteUnit    = rupees per unit or gram × 1,000,000
amountMinor                     = final rupee amount × 100, rounded once
rateBps                         = percentage × 100
```

Calculation:

```text
valueMinor = roundHalfUp(
  quantityMicroUnits × priceMicroRupeesPerQuoteUnit ÷ 10,000,000,000
)
```

Use `bigint` for the intermediate product, validate that the final result is a safe integer, then return integer paise. Parsing decimal provider text must be string-based. `Number.parseFloat`, binary floating-point multiplication, and inline `/ 100` formatting are forbidden.

The quote unit is explicit:

- mutual fund or ETF: `fund_unit`;
- physical gold or silver: `gram`; and
- any future unit requires a new shared schema and conversion helper.

### 5.3 Additive tables

#### `asset_market_links`

Append-only link revisions, with one active market link per asset:

```text
id
userId
assetId                         unique with userId
instrumentType                 mutual_fund | gold_etf | silver_etf |
                               gold_fund | silver_fund | sgb |
                               physical_gold | physical_silver
provider                       amfi | ibja | goldapi | metalpriceapi | manual
providerInstrumentId           AMFI scheme code, metal symbol/purity key, etc.
isin?                           exact ISIN when known
schemeCode?                     AMFI scheme code when applicable
schemePlan?                     direct | regular | unknown
schemeOption?                   growth | idcw | unknown
acquisitionChannel?             original_issue | secondary_market | unknown
quoteUnit                      fund_unit | gram
purityBps?                      required for physical metal when not 100%
autoValuationEnabled
effectiveFrom
supersededAt?
revisionOf?
createdAt
```

Rules:

- Every repository method is `userId`-first and filters by `userId` and `assetId`.
- An ISIN or exact scheme code match is accepted automatically.
- A normalized-name-only match remains `needs_confirmation` until the user selects it.
- Provider identity is stable metadata. A provider or classification change supersedes the active row and creates a new link revision in the same `withTxn`; it must not rewrite historical quote provenance.
- SGB requires issue identifier and acquisition channel metadata because maturity-tax treatment is not interchangeable with exchange sale.

#### `asset_position_events`

Authoritative, append-only holding history:

```text
id
userId
assetId
eventType                      opening | purchase | reinvestment | switch_in |
                               redemption | switch_out | reconciliation_in |
                               reconciliation_out | reversal
quantityMicroUnits             positive integer; direction derives from eventType
occurredAt                     ISO UTC; calendar interpretation in Asia/Kolkata
grossAmountMinor?              positive, when known
chargesMinor?                  positive, when known
taxesAtAcquisitionMinor?       positive, when known
transactionId?                 optional link to the existing ledger
assetFundingId?                optional link to asset_fundings
source                         manual | cas | broker_import | legacy_backfill
sourceReference                deterministic semantic identifier
portfolioImportRowId?
reversalOf?                    original position event
createdAt
```

Rules:

- Quantity magnitude is always positive. Event type supplies the sign.
- A correction is one `reversal` plus one corrected event. No update or delete is exposed.
- One original event can be reversed at most once.
- `sourceReference` is unique per user/source and makes worker retries idempotent.
- An acquisition event with date, quantity, and acquisition cost is a tax lot. Remaining lots are calculated by deterministic FIFO replay of acquisition and disposal events.
- If CAS only supplies a current balance, commit an `opening` or `reconciliation_*` event with unknown cost basis. The UI must not invent a purchase date or tax cost.
- A Sunday verifier recomputes current position, detects negative holdings, and checks any compatibility cache.

V1 can calculate lots by replay because a personal asset is expected to have a small event history. Introduce a derived lot-allocation table only if measurements demonstrate that replay is too slow; it must remain reproducible from append-only events.

#### `market_quote_snapshots`

Append-only, tenant-scoped provider observations:

```text
id
userId
assetMarketLinkId
provider
instrumentType
providerInstrumentId
currency                       INR in V1
quoteUnit                      fund_unit | gram
priceMicroRupeesPerQuoteUnit   positive safe integer
providerAsOf                   provider timestamp/date
fetchedAt                      actual fetch timestamp
quality                        official | benchmark | indicative
sourceDigest?                  hash of normalized provider record
createdAt
```

Uniqueness:

```text
(userId, assetMarketLinkId, provider, providerAsOf)
```

The scheduler may fetch one provider observation and reuse the validated in-memory result for several targets, but it persists a tenant-scoped snapshot for each linked asset. This small amount of duplication is intentional: every repository read and write can take `userId` first and filter it, with no global market-data exception in an API-facing path.

Only a worker-role `system*` method may discover active links across tenants, and each discovered row must include its owning `userId`. After discovery, quote and valuation mutations call ordinary tenant-scoped repository methods with that `userId`. The discovery service is not reachable from controllers, and a service test must prove the API role cannot invoke it.

#### `asset_valuations` additions

Add, without removing current columns:

```text
marketQuoteId?                 provenance for market-derived valuation
sourceReference?               deterministic materialization key
```

Extend valuation source with `market_sync`.

Add a unique sparse index equivalent to:

```text
(userId, assetId, source, sourceReference)
```

A market valuation is the value of the complete position at the quote's `providerAsOf`; it is not the price itself. Insert the valuation and its audit row in one `withTxn` call.

#### `portfolio_import_batches`

User-scoped import workflow:

```text
id
userId
source                         cams | kfintech | mfcentral | cdsl | nsdl | unknown
fileName
fileHash                       SHA-256 of uploaded bytes
statementAsOf?
coverageFrom?
coverageTo?
coverageKind?                  transaction_period | current_holdings | mixed
status                         queued | parsing | needs_review | ready |
                               committing | completed | failed | reverting | reverted
leaseOwner?
leaseExpiresAt?
attemptCount
rowCount
includedCount
warningCount
errorCount
failureCode?
createdAt
completedAt?
```

#### `portfolio_import_payloads`

Temporary encrypted upload material:

```text
batchId
userId
encryptedFile
encryptedPassword?             only if the PDF library cannot safely remove PDF
                               encryption within the bounded upload path
nonce
keyVersion
expiresAt
createdAt
```

Security rules:

- Never store or log a plaintext CAS password.
- Prefer validating/decrypting the PDF in a strictly bounded upload step and application-encrypting the resulting bytes so the worker never needs the PDF password.
- If benchmarks show that bounded decryption is not safe in the request path, envelope-encrypt the password separately with the application key; never put it in BullMQ/Redis job data.
- Delete the payload and any encrypted password immediately after rows are staged, and sweep abandoned payloads after the TTL.
- Store only normalized data required for the product. Do not retain PAN, address, nominee, bank details, full raw PDF text, or email content.
- A new encryption key environment variable requires Zod env validation, `.env.example`, a key-version strategy, and an operations runbook.

#### `portfolio_import_rows`

Reviewable normalized rows:

```text
id
userId
batchId
rowNumber
rowKind                       holding | transaction
semanticFingerprint
instrumentType
isin?
schemeCode?
displayName
folioReferenceMasked?
transactionType?
occurredAt?
quantityMicroUnits
grossAmountMinor?
navMicroRupeesPerUnit?
proposedAssetId?
matchStatus                   matched | needs_confirmation | unmatched | ignored
proposedAction                create_asset | append_event | reconcile | ignore
include
problems                      validated structured JSON
committedPositionEventId?
createdAt
```

The normalized JSON or `problems` object is parsed through shared Zod schemas both when written and when a database row leaves the repository.

### 5.4 Indexes

Add indexes for:

- one active `asset_market_links` revision per `(userId, assetId)` through a partial unique index;
- `(userId, assetId, occurredAt, id)` on position events;
- `(userId, source, sourceReference)` unique on position events;
- `(userId, batchId, id)` for cursor-paginated import review;
- `(userId, fileHash)` on import batches;
- `(userId, batchId, semanticFingerprint)` for semantic deduplication;
- `(userId, assetMarketLinkId, provider, providerAsOf)` unique on quote snapshots;
- latest quote lookup by `(userId, assetMarketLinkId, providerAsOf desc)`; and
- latest valuation lookup by `(userId, assetId, valuedAt desc, id desc)` if the existing index is insufficient.

Every foreign key between tenant-owned tables includes or is validated with the same `userId`. Prefer composite tenant foreign keys/unique constraints where Drizzle and PostgreSQL can enforce the relationship, in addition to repository predicates.

All schema changes use ordered, additive drizzle-kit migrations. No live column is dropped or renamed.

## 6. CAS import architecture

### 6.1 Why CAS is event-driven, not daily

Automated CAS dispatch is normally monthly when there was transaction activity and half-yearly when there was none. Current depository guidance uses dispatch targets after month-end; it does not expose an investor holdings API for this application to call every day.

The user can manually generate an on-demand statement daily, but doing so usually adds no information when no units changed. The application should show:

- “Prices updated daily”; and
- “Holdings last reconciled from CAS on &lt;date&gt;.”

Recommended prompts:

- immediately after the user records a SIP, purchase, switch, or redemption without units;
- when a scheduled transaction is expected to have executed;
- once per month when assets are market-linked; and
- when position value differs materially from a manually supplied broker/RTA snapshot.

Never cron-scrape CAMS, KFintech, MFCentral, CDSL, or NSDL request pages. CAPTCHA, OTP, email delivery, consent, format drift, and terms make that fragile and unsafe. A future automated route must use an official consented API, Account Aggregator flow, supported broker API, or user-authorized mailbox connector with a separate security review.

### 6.2 Upload and parse workflow

```text
1. Upload
   POST PDF + password + declared source
   validate MIME, %PDF magic, 5 MB cap, auth, idempotency key
               │
               ▼
2. Quarantine
   hash bytes, application-encrypt payload, create queued batch
   enqueue only { userId, batchId }
               │
               ▼
3. Parse worker
   claim lease, decrypt in memory, detect issuer/layout, extract text/tables
   parse unknown input with source-specific Zod adapters
               │
               ▼
4. Normalize and stage
   remove unneeded PII, derive semantic fingerprints, stage ≤200 rows/txn
   delete encrypted payload when staging is complete
               │
               ▼
5. Match and review
   ISIN → scheme code → normalized-name candidate
   user confirms every uncertain match and every reconciliation
               │
               ▼
6. Commit
   create/link assets and append position events in idempotent ≤200-row txns
   record audit entries and committed ids
               │
               ▼
7. Value
   latest persisted quote materializes asset valuation; no external call in commit
```

### 6.3 Parser boundaries

Create source adapters behind one interface:

```text
CasParser
  supports(documentFingerprint): boolean
  parse(input: Uint8Array): ParsedPortfolioStatement

implementations
  CAMS CAS adapter
  KFintech CAS adapter
  MFCentral CAS adapter
  CDSL CAS adapter
  NSDL CAS adapter
```

The concrete PDF extraction library requires approval before installation. Evaluate it against:

- password-protected PDFs;
- text-based and table-based statements;
- memory/CPU behavior at the 5 MB limit;
- maintained Node 24 support;
- no native runtime surprise on the Proxmox LXC; and
- security history and transitive dependency size.

Scanned-image OCR is out of scope for V1. Return a typed `unsupported_scanned_statement` problem rather than invoking a remote OCR service or guessing.

### 6.4 Matching rules

Match in this order:

1. exact ISIN;
2. exact AMFI scheme code;
3. exact provider identity already linked by the user;
4. normalized scheme name generating candidates only; and
5. manual creation/selection.

The parser must preserve direct/regular and growth/IDCW distinctions. “Same fund house and similar name” is not sufficient.

CAMS warns that CAS coverage may not include all demat holdings. The batch therefore records statement source, coverage dates, and coverage kind. Combining RTA and depository statements must deduplicate by instrument, folio/demat context, transaction reference, date, quantity, and amount; source precedence is a reviewed rule, not a blind union.

### 6.5 Commit semantics

- The API mutation requires `Idempotency-Key`.
- The file hash rejects exact byte duplicates.
- Semantic fingerprints reject identical rows from regenerated PDFs.
- The worker may clear and rewrite uncommitted staged rows on retry.
- A committed row is immutable.
- A statement difference becomes a proposed `reconciliation_in` or `reconciliation_out`; the user must approve it.
- A CAS redemption does not automatically create an expense-ledger credit because the destination account and existing imported bank transaction may be ambiguous.
- The user may later link a position event to an existing transaction or asset funding.
- Revert appends reversals for committed position events. It never deletes them and never mutates unrelated ledger rows.

## 7. Market-data source strategy

### 7.1 Provider matrix

| Need | Recommended source | Role | Production note |
|---|---|---|---|
| Indian mutual-fund daily NAV | AMFI `NAVAll.txt` | Primary | Official daily batch; parse the decimal text, validate scheme code and date, and store only tracked instruments. |
| Fund search/history convenience | MFAPI.in | Secondary/prototype | Useful free JSON and history access, but no contractual SLA should be assumed. Never make it the only recoverable mapping source. |
| Indian gold/silver indicative spot | Gold API | V1 primary | Use the public XAU/INR and XAG/INR endpoints once daily. Preserve that these are global spot-derived reference prices, not IBJA or dealer buyback quotes. |
| Indian gold/silver benchmark | IBJA | Deliberately deferred | Do not scrape IBJA or use unofficial wrappers. A future benchmark integration requires a separately approved licensed source. |
| CAS generation | CAMS/KFintech/MFCentral/CDSL/NSDL | Manual input | No daily scraping. Use user-requested secure statement upload. |

The provider abstraction must allow configuration without changing valuation logic:

```text
MarketDataProvider
  providerName
  supportedInstrumentTypes
  fetchQuotes(trackedProviderIds): Promise<unknown>
  parseResponse(unknown): QuoteCandidate[]
```

Provider calls, response parsing, retries, and rate limits remain outside `withTxn`.

### 7.2 Scheduling

Do not implement a generic “sync everything morning and evening” cron.

Use provider-specific schedules:

- AMFI: after expected end-of-day publication, initially around 23:15 IST, with a morning retry for missing dates;
- Gold API: once daily after Indian market close, globally cached for all users; and
- manual refresh: enqueue a rate-limited job and return `202`; do not call a provider in the HTTP request.

The final times are configuration owned by the provider adapter and confirmed against its contract. Calendar computations use `Asia/Kolkata`; stored timestamps remain UTC.

### 7.3 Quote ingestion and valuation materialization

```text
ScheduledRunCoordinator
  │
  ├─ systemDiscoverValuationTargets()
  │    returns { userId, assetMarketLinkId, providerInstrumentId }
  │
  ├─ group/deduplicate provider instrument ids in memory
  │
  ├─ provider HTTP outside transaction
  │
  ├─ Zod parse + fixed-point normalization outside transaction
  │
  └─ for each tenant chunk ≤200:
       calculate positions and values
       withTxn(
         insert tenant quote snapshots +
         insert valuations +
         insert audit rows
       )
```

Rules:

- A `system*` discovery row always includes the owning `userId`.
- Every tenant mutation receives `userId` as its first argument and filters by it.
- The API-role service cannot invoke cross-tenant discovery or sweeps.
- A job is safe to retry after any line.
- Quote and valuation source references are deterministic.
- Every quote/valuation/audit money write occurs inside `withTxn`; provider I/O and parsing never do.
- There is no hardcoded fallback write. When a fetch fails, retain the last-known quote, increment staleness, and expose the failure operationally.
- A newly funded asset may be valued immediately from the latest persisted quote; it must not perform a provider call inside the funding transaction.

### 7.4 Freshness contract

Return all three concepts:

```text
providerAsOf      when the provider says the price applies
fetchedAt         when TreasuryOps obtained it
freshness         fresh | delayed | stale | unavailable
```

Examples:

- A Friday mutual-fund NAV can remain the valid latest value over a weekend without being labelled an error.
- A metal quote older than its configured SLA is stale even if the job fetched the same cached provider response today.
- “Fetched today” never substitutes for the provider's actual price date.

## 8. Asset funding, positions, and net worth

### 8.1 Asset creation

Extend the shared asset-create request additively with optional nested objects:

```text
marketLink?
openingPosition?
```

When present, the service creates asset identity, market link, opening event, initial valuation from a persisted quote when available, and audit entries in one `withTxn`. Existing clients that submit only current fields remain valid.

For physical metal, the UI collects:

- total weight;
- purity, such as 999/995/916/750/585;
- optional acquisition date and total purchase cost;
- optional making charge/tax components when the user knows them; and
- whether the price shown should be pure-metal reference or a dealer buyback override.

For mutual funds, the UI collects exact scheme, units, date, and optional acquisition cost. The user never needs to type daily NAV to keep valuation current.

### 8.2 Funding a market-linked investment

Extend asset funding additively with optional position data:

```text
quantityMicroUnits?
tradeNavMicroRupeesPerUnit?
chargesMinor?
occurredAt?
```

For a market-linked investment, the service atomically creates:

1. the ledger transaction through the existing money-write path;
2. the `asset_fundings` row;
3. the position event linked to both; and
4. audit rows.

If units are not known when an SIP bank debit is recorded, funding may be created first. Units are appended later using a linked position event; do not edit the original funding amount.

### 8.3 Compatibility and backfill

`quantityMilliUnits` remains in `net_worth_assets` during migration.

Backfill each existing gold/silver asset with one deterministic `legacy_backfill` opening event at the asset opening date. Convert milli-units to micro-units exactly. During compatibility:

- position events are authoritative for linked assets;
- `quantityMilliUnits` may be maintained as a derived cache for legacy readers in the same transaction as a new event;
- a verifier compares the cache to event replay; and
- reads fall back to the legacy field only when no backfilled event exists.

Do not drop the field in this project. Removal, if ever justified, is a separate migration plan after all clients and backups have crossed the compatibility window.

### 8.4 Net-worth behavior

The current net-worth service should continue to read the latest `asset_valuations` row. The market worker materializes one daily valuation per tracked asset/quote.

After a new funding and before the next quote:

- if a persisted quote exists, append a new valuation using it; or
- if no quote exists, the existing contribution-after-last-valuation behavior provides a conservative carrying value.

Once a new full-position valuation is written, it supersedes that approximation. Add integration fixtures for purchase, valuation, second purchase, weekend, and redemption sequences so contribution logic cannot double count.

## 9. Disposal and post-tax estimate

### 9.1 Product language

Call this a **disposal estimate**, not “tax due” and not “guaranteed sell value.”

Always display two headline values:

```text
estimated cash at settlement
estimated proceeds after tax
```

The first reflects NAV/quote and immediate deductions. The second also applies an estimated capital-gains rule when enough tax-lot context exists.

### 9.2 Common calculation pipeline

```text
gross proceeds
− exit load / dealer spread / melting-assay deduction
− STT and supported transaction charges
− user-supplied other charges
= estimated cash at settlement

estimated cash at settlement
− allocated tax cost basis
= estimated capital gain or loss

estimated cash at settlement
− estimated incremental tax on the gain
= estimated post-tax proceeds
```

All line items are integer paise. The response shows the quote source and timestamp used.

### 9.3 Physical gold and silver

Reference formula:

```text
fineWeight = grossWeight × purityBps ÷ 10,000
referenceMetalValue = fineWeight × reference price per gram
settlementCash = referenceMetalValue − dealer deductions
```

The provider benchmark is not the amount a local jeweller guarantees. Dealer spread, stone weight, making charges, melting/assay deductions, and payment terms vary. Support either:

- a user-entered dealer buyback quote; or
- a configurable deduction range that returns low/base/high settlement estimates.

Do not automatically subtract 3% GST when a private individual sells personal old gold/silver. Purchase GST generally contributes to acquisition cost and is not refunded; whether a sale is a taxable supply depends on the seller's facts. V1 supports only disposal of a personal capital asset by a resident individual and shows this assumption prominently.

For supported personal capital assets, rule tables must encode the effective holding-period and rate applicable on the sale date. Current planning assumptions include a 24-month long-term threshold for physical gold/silver and 12.5% long-term capital-gains rate without indexation under the post-23-July-2024 regime, while short-term gains use the applicable slab rate. Revalidate the exact effective-date law before shipping.

### 9.4 Mutual funds and exchange-traded products

Mutual-fund settlement estimate:

```text
units × applicable/latest NAV
− scheme exit load
− STT when applicable
− supported charges
```

Today's final NAV may not yet be known. The estimate must say “using latest published NAV” and show its date. It must not imply that the displayed value is the final redemption consideration.

Tax classification comes from instrument metadata and lot acquisition date, never the asset name:

- equity-oriented fund: current planning rules include 20% STCG up to 12 months and 12.5% LTCG after 12 months, with the section 112A aggregate annual exemption input;
- debt-heavy “specified mutual fund” acquired in the applicable post-1-April-2023 regime: generally deemed short-term and taxed at the applicable rate;
- listed gold/silver ETF: apply the listed-instrument holding threshold and effective-date rule;
- unlisted gold/silver fund or fund-of-funds: apply its actual portfolio/legal classification and unlisted-unit holding threshold; and
- SGB: use a separate rule. Do not apply physical-gold or ETF logic. Maturity exemption depends on the effective law, original subscription/continuous holding conditions, and disposal route.

Every one of these rules lives in versioned code with `effectiveFrom`, `effectiveTo`, rule id, and tests. Do not scatter percentages through controllers or React components.

### 9.5 Tax context and limitations

The estimate request supplies only the minimum context needed:

```text
taxYear
taxpayerType                   resident_individual in V1
ordinaryIncomeTaxRateBps?      required for slab-rate estimates
surchargeRateBps?              optional approximation
equityLtcgExemptionRemainingMinor?
capitalLossOffsetMinor?
```

Do not ask for or persist full salary, PAN, return data, or other unrelated tax details in V1.

If cost basis, acquisition date, instrument classification, or required tax context is missing:

- return settlement cash;
- set gain/tax/post-tax values to `null` where they cannot be supported; and
- include a machine-readable warning such as `missing_cost_basis`.

Capital-loss set-off, surcharge marginal relief, cess, annual exemption consumption, grandfathering, and rounding are easy to misstate. V1 may provide a bounded approximation only where explicitly modelled and tested. Unsupported cases return `unsupported_tax_context`, never a guessed number.

### 9.6 Example response

```json
{
  "assetId": "e0dbdb8f-3dc8-4dc9-ac61-d9c84595d188",
  "quantityMicroUnits": 125000000,
  "quote": {
    "provider": "amfi",
    "providerAsOf": "2026-08-21T18:30:00.000Z",
    "fetchedAt": "2026-08-21T19:01:12.000Z",
    "priceMicroRupeesPerQuoteUnit": 186543200,
    "freshness": "fresh"
  },
  "grossProceedsMinor": 2331790,
  "deductions": {
    "exitLoadMinor": 0,
    "sttMinor": 23,
    "dealerDeductionsMinor": 0,
    "otherChargesMinor": 0
  },
  "cashSettlementMinor": 2331767,
  "costBasisMinor": 1900000,
  "estimatedGainMinor": 431767,
  "estimatedTaxMinor": 56130,
  "postTaxProceedsMinor": 2275637,
  "taxRuleId": "in-resident-equity-mf-2024-07-23-v1",
  "confidence": "estimate",
  "assumptions": [
    "Latest published NAV used; final redemption NAV can differ.",
    "FIFO lot allocation used.",
    "Tax context supplied by the user has not been independently verified."
  ],
  "warnings": []
}
```

The values above illustrate the contract only; they are not a tax example to copy into production tests.

## 10. REST API design

All external routes are under `/api/v1`. Better Auth supplies the session, and controllers obtain `userId` only through `@CurrentUser()`.

### 10.1 Instrument discovery

```http
GET /api/v1/assets/instruments?type=mutual_fund&q=parag&cursor=...&limit=50
```

Purpose: exact scheme selection from a cached AMFI catalog/provider adapter.

Response item:

```json
{
  "instrumentType": "mutual_fund",
  "provider": "amfi",
  "providerInstrumentId": "122639",
  "schemeCode": "122639",
  "isin": "INF000000000",
  "name": "Example Fund - Direct Plan - Growth",
  "schemePlan": "direct",
  "schemeOption": "growth",
  "quoteUnit": "fund_unit"
}
```

Default limit is 50; maximum is 200. Use an opaque cursor. A selected instrument is copied into a tenant-owned `asset_market_links` row. V1 does not require a controller-writable global instrument table.

### 10.2 Position resources

```http
GET  /api/v1/assets/{assetId}/position
GET  /api/v1/assets/{assetId}/position-events?cursor=...&limit=50
POST /api/v1/assets/{assetId}/position-events
POST /api/v1/assets/{assetId}/position-events/{eventId}/reversals
```

The collection is cursor-paginated by `(occurredAt, id)`. Both POST routes require `Idempotency-Key` and return the created append-only event. The reversal endpoint does not accept replacement monetary fields.

### 10.3 Market value resources

```http
GET  /api/v1/assets/{assetId}/market-valuation
POST /api/v1/assets/{assetId}/market-refreshes
```

`market-valuation` returns position, latest quote metadata, latest materialized valuation, and freshness. `market-refreshes` enqueues a rate-limited job and returns `202 Accepted` with an operation location. It is a mutation and requires `Idempotency-Key`.

Keep the existing `GET /api/v1/assets/market-rates` response backward compatible. Add provider/as-of/freshness fields only additively or introduce a new typed response beside it. Deprecate the undocumented Yahoo/fallback semantics only after the frontend has migrated.

### 10.4 Portfolio import resources

```http
POST /api/v1/portfolio-imports/cas
GET  /api/v1/portfolio-imports/{batchId}
GET  /api/v1/portfolio-imports/{batchId}/rows?cursor=...&limit=50
PATCH /api/v1/portfolio-imports/{batchId}/rows/{rowId}
POST /api/v1/portfolio-imports/{batchId}/commit
POST /api/v1/portfolio-imports/{batchId}/revert
```

Upload:

- `multipart/form-data` with PDF, password when required, and declared source;
- PDF MIME plus magic-byte validation;
- maximum 5 MB;
- `Idempotency-Key` required;
- `202 Accepted` with `Location: /api/v1/portfolio-imports/{batchId}`; and
- password never included in the response or queued job payload.

Rows use opaque cursor pagination. PATCH is limited to review state such as candidate asset, action, and include flag; it cannot alter parser-derived financial values. A correction to a parsed value requires excluding the row and appending a manual event with clear provenance.

Commit and revert return `202` when worker processing is required. Repeating either request returns the original operation result.

### 10.5 Disposal estimates

```http
POST /api/v1/assets/{assetId}/disposal-estimates
```

This is a calculation resource using POST because inputs are structured and may be sensitive. It returns `200 OK` and performs no database mutation. It does not require an idempotency key.

Example request:

```json
{
  "quantityMicroUnits": 125000000,
  "quoteOverride": null,
  "expectedOtherChargesMinor": 0,
  "taxContext": {
    "taxYear": "2026-27",
    "taxpayerType": "resident_individual",
    "ordinaryIncomeTaxRateBps": 3000,
    "surchargeRateBps": 0,
    "equityLtcgExemptionRemainingMinor": 12500000,
    "capitalLossOffsetMinor": 0
  }
}
```

### 10.6 Errors

Use the global RFC 7807 problem response. New stable problem types include:

| Status | Type | When |
|---|---|---|
| `400` | `invalid-pdf` | MIME/magic or PDF structure is invalid. |
| `401` | existing auth problem | No valid session or API key. |
| `404` | existing entity-not-found | Asset, batch, or row is absent or belongs to another tenant. |
| `409` | `duplicate-portfolio-import` | Same committed semantic statement was already imported. |
| `409` | `position-event-already-reversed` | Reversal already exists. |
| `409` | `portfolio-import-state-conflict` | Operation is invalid for current batch state. |
| `413` | `portfolio-import-too-large` | PDF exceeds 5 MB. |
| `422` | `cas-password-required` | Statement is encrypted and no password was supplied. |
| `422` | `cas-password-invalid` | Supplied password cannot decrypt the statement. |
| `422` | `unsupported-cas-layout` | Issuer/layout has no safe parser. |
| `422` | `unsupported-scanned-statement` | Image-only statement is out of scope. |
| `422` | `insufficient-disposal-context` | Required instrument or position data is missing. |
| `422` | `unsupported-tax-context` | Taxpayer/instrument scenario is outside V1. |
| `429` | existing rate-limit problem | Manual refresh is requested too frequently. |
| `503` | `market-data-unavailable` | No usable latest quote exists. |

Do not include PAN, folio, password, raw provider body, or PDF text in a problem detail.

### 10.7 OpenAPI and compatibility

- Define request/response/query contracts in `packages/shared` and derive TypeScript from Zod.
- Register every route and RFC 7807 response in the OpenAPI registry.
- Regenerate the typed web client with `pnpm gen:client`.
- Confirm every authenticated route appears in the tenancy probe input.
- Existing V1 clients remain valid through optional fields and new resources.
- A required-field or semantic breaking change requires a new version; do not silently redefine an existing field.
- Cursor tokens are opaque and versioned internally so sort changes can be rejected safely.

## 11. Backend module design

Keep the modular monolith and one-way dependencies:

```text
AssetsModule
  ├─ AssetController
  ├─ AssetService
  ├─ PositionService
  ├─ MarketValuationService
  ├─ DisposalEstimateService
  └─ tenant-scoped repositories

MarketDataModule
  ├─ provider adapters
  ├─ quote normalization
  ├─ scheduled coordinator
  ├─ BullMQ processor
  └─ worker-only operational repositories

PortfolioImportsModule
  ├─ PortfolioImportController
  ├─ PortfolioImportService
  ├─ CAS parser adapters
  ├─ match/reconciliation service
  ├─ BullMQ processor
  └─ tenant-scoped batch/row repositories

packages/shared
  ├─ fixed-point schemas/helpers
  ├─ market instrument and quote schemas
  ├─ position contracts
  ├─ portfolio import contracts
  └─ disposal estimate contracts
```

`PortfolioImportsModule` may inject public methods from `AssetsModule`; it must not deep-import asset repositories. The existing transaction-import module must not be made aware of asset positions. Shared import workflow helpers may move to `common/` only when they are genuinely generic.

Controllers parse, call one service method, and map results. Services own matching, rules, state transitions, idempotency, and `withTxn`. Repositories are the only layer touching Drizzle.

## 12. Frontend implementation

Backend contracts and generated client land before UI work.

### 12.1 Asset creation

Add conditional fields to the existing asset flow:

- mutual fund: searchable exact AMFI instrument, units, acquisition date, and optional acquisition cost;
- physical gold/silver: weight, purity, acquisition date/cost, and optional dealer deduction assumption;
- ETF/SGB: exact instrument selection and acquisition channel where required; and
- manual investment: continue to support manual valuations when no provider is linked.

No user has to enter daily NAV. A manual price is an explicit override/valuation, not a fake provider quote.

### 12.2 CAS import wizard

```text
Upload
  → Queued/parsing status
  → Statement summary and coverage
  → Match holdings/transactions
  → Review reconciliations and warnings
  → Confirm commit
  → Completion summary with links to assets
```

The page polls the typed status endpoint or uses the existing job-status pattern. It does not parse PDFs in the browser. Password state stays in component memory only and is cleared after upload.

### 12.3 Asset detail

Show:

- current units/weight and purity;
- current market value using `formatMinor()`;
- quote provider, provider timestamp, fetch timestamp, and freshness badge;
- last holdings reconciliation source/date;
- valuation history;
- append-only position activity;
- funding links where present;
- “Refresh market data” as an asynchronous action; and
- “Estimate sale” action.

Do not label value movement as investment return when cash flows are not accounted for.

### 12.4 Disposal estimate sheet

The sheet collects only required assumptions and renders:

```text
Gross reference value
Immediate deductions
Estimated settlement cash
Allocated cost basis
Estimated gain/loss
Estimated tax
Estimated post-tax proceeds
```

Physical metal additionally displays a low/base/high range when dealer deductions are not known. Every estimate shows source, price date, rule id, assumptions, unsupported items, and a “not tax advice” notice.

### 12.5 Frontend rules

- App Router server components remain the default.
- Data access is only through the generated client.
- Interactive islands use existing query/form patterns.
- Every mutation form creates an idempotency UUID on mount.
- Money uses shared `formatMinor()`.
- Fixed-point quote and quantity formatting uses shared helpers.
- Tailwind only; no new UI dependency.
- Loading, empty, stale, partial-tax-data, worker-failure, and retry states are designed explicitly.

## 13. Security and privacy

CAS is among the most sensitive uploads in the product. Apply these controls before enabling the route:

- Better Auth and current upload rate limits;
- user id from session only;
- strict PDF MIME, magic, size, page-count, decompression, CPU, and parse-time limits;
- no outbound link/resource fetching by the PDF parser;
- isolated worker process with bounded memory and job timeout;
- authenticated encryption at rest with key version and unique nonce;
- no password in Redis, queue payloads, logs, traces, analytics, errors, or audit metadata;
- payload deletion immediately after staging and a worker-only TTL sweeper;
- masked folio references and no PAN/address/bank/nominee persistence;
- structured pino logs containing ids/counts/status only;
- tenant predicate on every batch/row/position/link query;
- authorization tests for asset, batch, row, refresh, commit, revert, and estimate routes;
- provider secrets through validated env only; and
- provider responses treated as untrusted `unknown` until Zod validation.

Do not email, upload, or send CAS content to an LLM or third-party OCR/parser service in V1.

## 14. Reliability, performance, and observability

### 14.1 Initial service targets

| Concern | Target |
|---|---|
| Asset/position/market-value read | p95 under 200 ms from PostgreSQL on the home LXC under normal personal workload |
| CAS upload acknowledgement | `202` within 500 ms excluding client upload transfer, subject to encryption benchmark |
| 5 MB CAS parse | Complete or fail with a typed reason within 60 seconds |
| Import row page | p95 under 250 ms at limit 50 |
| Scheduled valuation | Complete before the next morning retry window |
| Provider outage | Existing net worth remains available with stale provenance |
| Retry | At-least-once BullMQ delivery produces one semantic result |

These are starting SLOs, not reasons to weaken correctness or security.

### 14.2 Storage controls

- Store AMFI quotes only for tracked schemes, plus the current searchable catalog in bounded cache.
- Fetch and validate a metal quote once per provider instrument per job, then persist the deliberately tenant-scoped snapshots required by repository isolation.
- Retain normalized quote history needed for valuation provenance; define a compaction policy only after measuring growth.
- Delete encrypted CAS payloads after staging; retain normalized rows and audit references according to the application's financial-history policy.

### 14.3 Metrics and logs

Add metrics or structured scheduled-run fields for:

- provider fetch duration/status/record count;
- latest provider-as-of date and staleness;
- quote validation rejects and duplicate count;
- valuation targets/success/failure/skip count;
- CAS queue wait, parse duration, source/layout, staged rows, warnings, failures;
- match rate by exact ISIN/scheme code/manual confirmation;
- commit/revert rows and idempotent duplicates;
- expired payload sweeps; and
- position/legacy-cache invariant failures.

Never use labels containing user PII or unbounded scheme names.

### 14.4 Failure behavior

| Failure | Required behavior |
|---|---|
| AMFI is late/unavailable | Keep last quote, mark delayed/stale, retry later, no fallback valuation. |
| Metal provider quota exhausted | Stop calls, retain stale quote, surface operational warning. |
| Provider returns malformed decimals | Reject record through Zod/fixed-point parser; never coerce to zero. |
| Duplicate provider response | Unique key returns original quote; valuation source key prevents duplicates. |
| Wrong PDF password | Typed failure, no raw parser message, allow safe retry with a new upload operation. |
| Unknown CAS layout | Preserve batch metadata, delete expired payload, return unsupported layout; do not partially commit. |
| Worker dies while staging | Lease expires; retry clears/rebuilds only uncommitted stage rows. |
| Worker dies during commit | Chunk/source references make replay idempotent and resumable. |
| Missing ISIN | Candidate matching only; require confirmation. |
| CAS/current-position mismatch | Stage a reconciliation event; never overwrite quantity. |
| Missing tax cost/date | Show settlement cash; tax/post-tax remain unavailable with warning. |
| Cross-tenant id supplied | Same 404 as missing resource; no existence leak. |

## 15. Testing strategy

### 15.1 Unit tests

- Decimal-string to fixed-point conversion, including rounding boundaries and overflow.
- Quantity × price using `bigint`, including metal purity.
- Each provider Zod adapter with valid, missing, malformed, duplicate, stale, and changed formats.
- Sanitized fixtures for supported CAMS, KFintech, MFCentral, CDSL, and NSDL layouts.
- Password required/wrong, corrupted, oversized, decompression-bomb, image-only, and unknown-layout PDFs.
- ISIN/scheme-code matching and ambiguous-name behavior.
- Semantic fingerprint stability across whitespace/layout variations.
- Position replay, reversals, reconciliation, negative-position rejection, and FIFO lot allocation.
- Tax-rule golden cases by effective date and instrument classification.
- Missing-data and unsupported-tax-context responses.
- Weekend/holiday freshness classification.

No production CAS or real PII may enter fixtures.

### 15.2 Integration tests

Run against migrated testcontainers PostgreSQL and finish every relevant file with `assertInvariants()`:

- tenant isolation for every new table and repository;
- quote snapshot + valuation + audit atomicity;
- funding + position event + account balance + audit atomicity;
- import stage/commit/revert lifecycle;
- ≤200-row chunk resume after injected failure;
- exact duplicate file and semantic duplicate statement;
- backfill and legacy quantity-cache verification;
- latest valuation/net-worth behavior around purchases and redemptions;
- worker-only system discovery returns owner `userId`;
- API-role service cannot invoke sweeps; and
- encrypted payload TTL deletion.

### 15.3 Concurrency tests

Use `Promise.all` with at least five identical attempts and assert one effect for:

- asset creation with opening position;
- manual position event;
- event reversal;
- CAS upload/commit/revert;
- quote insertion; and
- market valuation materialization.

### 15.4 E2E and contract tests

- Authenticated route success and other-tenant 404 behavior.
- Upload MIME/magic/size/password errors.
- Cursor pagination with stable ordering.
- `202` operation polling for upload, commit, revert, and refresh.
- Disposal estimate performs no database mutation.
- OpenAPI contains every authenticated route and tenancy probe coverage.
- Generated client compiles and existing asset flows remain compatible.

### 15.5 Required local gates

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
```

Run `pnpm gen:client` after shared/OpenAPI changes and `pnpm migrate:generate` for each additive schema slice.

## 16. Delivery sequence

Each phase is a separate reviewable change. Backend precedes frontend.

### Phase 0 — decisions and approvals

- Approve one PDF extraction library after security/runtime evaluation.
- Confirm Gold API remains suitable for a personal, indicative spot quote; preserve the explicit non-IBJA/non-dealer label.
- Confirm whether AMFI catalog is cached in Redis or a bounded application cache.
- Approve CAS encryption/key-management runbook.
- Have the initial tax-rule table reviewed against then-current Indian law.
- Record the ADRs in section 17.

Exit: no unresolved dependency, provider, security, or legal-data assumption blocks coding.

### Phase 1 — fixed-point and position foundation

- Add shared quantity/price schemas and helpers.
- Add market links and append-only position events.
- Add tenant repositories, service methods, audits, reversals, and verifier.
- Backfill legacy metal quantities additively.
- Extend asset create/funding requests with optional position metadata.
- Test atomicity, idempotency, concurrency, and net-worth compatibility.

Exit: manually linked assets and positions work without any provider or CAS.

### Phase 2 — persisted market data and automatic valuations

- Add quote snapshot schema and valuation provenance fields.
- Implement AMFI adapter and tracked-instrument catalog/search cache.
- Implement the Gold API XAU/INR and XAG/INR adapter and its spot-indicative provenance.
- Add source-specific BullMQ jobs, schedules, retry/freshness behavior, and metrics.
- Materialize daily valuations and migrate the asset detail read contract.
- Keep existing market-rates API compatible.

Exit: tracked mutual funds and physical metals value automatically with visible provenance and stale behavior; physical-metal values remain labelled as indicative spot.

### Phase 3 — portfolio/CAS imports

- Add import batch/payload/row tables and state machine.
- Implement encrypted upload and TTL sweeper.
- Implement approved source parsers incrementally, starting with the user's actual issuer using sanitized fixtures.
- Add matching, review, semantic dedupe, commit, and revert.
- Add portfolio-import REST/OpenAPI contracts and tenancy/concurrency tests.

Exit: a supported CAS imports safely only after user review.

### Phase 4 — frontend portfolio experience

- Add instrument-aware asset creation.
- Add CAS upload/review/commit wizard.
- Add position activity and quote provenance to asset detail.
- Add freshness and monthly reconciliation prompts.
- Regenerate/use the typed client and add route boundaries.

Exit: users no longer type daily mutual-fund NAV and can see when holdings versus prices were last updated.

### Phase 5 — disposal estimate

- Implement reviewed, effective-dated tax classifications and FIFO lot replay.
- Add fixed-point settlement and tax calculation service.
- Add estimate API, warnings, confidence, and golden tests.
- Add frontend sheet with dealer-quote/range inputs and clear limitations.

Exit: supported assets show reproducible settlement and post-tax estimates; unsupported/missing contexts never produce fabricated tax.

### Phase 6 — optional integrations

Only after the manual workflow is stable:

- supported broker/RTA CSV imports;
- official broker API or consented Account Aggregator feed;
- user-authorized mailbox attachment intake with phishing/malware review;
- more CAS layouts; and
- contribution-aware XIRR and realized/unrealized gains.

Each integration needs its own provider terms, secret management, retry, and data-deletion review.

## 17. Architecture decisions

### ADR-1 — Separate positions, quotes, valuations, and estimates

**Decision:** Model them as separate resources joined by stable asset/instrument identity.

**Why:** They change on different schedules, have different provenance, and require different correction behavior. A mutable `currentValue` cannot explain whether units or price changed.

**Trade-off:** More tables and services, but deterministic reconciliation, auditability, and simpler failure isolation.

### ADR-2 — AMFI is the primary mutual-fund NAV source

**Decision:** Parse official AMFI daily data for production NAV; treat MFAPI.in as a convenience adapter, search/history aid, or fallback only.

**Why:** AMFI is the authoritative public source, while a free community API should not be a single operational dependency.

**Trade-off:** AMFI's text feed requires catalog parsing and provider-date handling.

### ADR-3 — Manual/event-driven CAS, no daily scraping

**Decision:** Users upload secure statements on demand; the application schedules quote refresh, not CAS generation.

**Why:** Holdings change on transactions, official dispatch is periodic, and consumer request pages require interactive identity checks and have no supported daily API contract.

**Trade-off:** Holdings are not magically synchronized after every external trade. The UI must show reconciliation age and prompt appropriately.

### ADR-4 — Append-only position events with materialized valuations

**Decision:** Position changes are events; current quantity is replayed/verified. Daily full-position values are appended to the existing valuation table.

**Why:** It matches the product's ledger philosophy while preserving the fast existing net-worth read model.

**Trade-off:** Compatibility cache and replay invariants need testing.

### ADR-5 — Tax estimation is bounded and versioned

**Decision:** Support resident-individual capital assets first. Rules are effective-dated code, estimates are read-only, and unsupported contexts return no guessed tax.

**Why:** Indian treatment varies by instrument, acquisition date, holding period, total annual gains, residency, and law version.

**Trade-off:** Some users see settlement cash without a post-tax number until they supply missing lot/context data.

### ADR-6 — CAS material is transient and application-encrypted

**Decision:** Keep uploaded bytes and, only if unavoidable, a sealed password for the minimum worker lifetime. Never persist plaintext credentials or unneeded CAS PII.

**Why:** Async parsing must be retryable without placing secrets in Redis, but permanent raw-statement storage creates disproportionate risk.

**Trade-off:** Key management, deletion verification, and recovery semantics become required operational work.

### ADR-7 — Modular monolith, not a market-data microservice

**Decision:** Add Nest modules and BullMQ processors in `apps/api`.

**Why:** The workload is small, strongly coupled to tenant assets/audit/valuations, and already has durable queue and scheduled-run patterns.

**Trade-off:** Provider/parsing jobs must be resource-bounded so they cannot starve API processes.

### ADR-8 — Gold API is the V1 indicative physical-metal source

**Decision:** Use Gold API's public `XAU/INR` and `XAG/INR` endpoints for a once-daily, globally
cached physical-metal spot reference. Store its timestamp and convert its INR-per-troy-ounce
decimal to the shared INR-per-gram quote unit with fixed-point bigint arithmetic. Label every
result `spot_indicative`; it is neither an IBJA benchmark nor a dealer buyback/appraisal quote.
Do not scrape IBJA or use the `0xSaurabhx/IBJA-API` wrapper.

**Why:** Gold API publishes free gold and silver price endpoints, including INR conversion, with
no API key requirement. It meets the personal application's low-volume rate need without a paid
subscription while retaining provider timestamp and provenance.

**Trade-off:** The source offers no accuracy, availability, or financial-reliance warranty. It
must never be used silently as a price for sale, tax calculation, or jewellery appraisal. A failed
refresh leaves the last persisted value visible and stale; it does not fabricate a replacement.
Manual valuation remains available as an explicit override.

### ADR-9 — Text-only `pdf-parse` extraction with application-level sealing

**Decision:** Use the Node 24-compatible `pdf-parse` package, pinned to an approved version, for
text-only CAS extraction and password handling. Process a PDF only in the worker role; do not
render it, execute embedded scripting, follow embedded links, or enqueue raw bytes/passwords.
Seal transient PDF bytes and, only when needed for retry, the password separately with Node
`crypto` AES-256-GCM using a 32-byte environment key and a fresh 96-bit nonce per encryption.
The queue receives only the portfolio-import batch ID. A sweeper permanently removes both sealed
fields after the configured TTL and successful parsing removes the sealed password immediately.

**Why:** `pdf-parse` documents password-protected PDF extraction and supports the repository's
Node 24 runtime. AES-GCM supplies confidentiality and tamper detection without adding a second
cryptography dependency or persisting plaintext credentials in PostgreSQL/Redis.

**Trade-off:** This adds one reviewed parsing dependency and an encryption-key rotation/recovery
runbook. A parser is not enabled for an issuer until sanitized fixtures prove that issuer's layout;
scanned/image-only PDFs remain unsupported in V1.

### ADR-10 — Conservative resident-individual disposal-estimate scope

**Decision:** The initial estimator is available only for a user who explicitly declares a
resident-individual, capital-asset context and provides the applicable tax year and marginal
ordinary-income rate. It calculates only when deterministic FIFO lots contain acquisition date,
quantity, and cost. V1 declines to estimate tax for non-residents, HUFs/entities, business
inventory/dealer stock, incomplete cost history, and every SGB disposal/redemption until the
original-issue and continuous-holding conditions can be proven. It must always return settlement
cash when a quote is available, even where post-tax proceeds are unavailable.

For a disposal on or after 23 July 2024, the initial reviewed rule table may cover physical gold
and silver after a 24-month holding period, and equity-oriented mutual funds only when the
required classification/STT evidence is present. Debt-oriented specified mutual funds remain
outside V1 pending scheme classification and tax review. Every response identifies its rule
version, inputs, exclusions, and uncertainty; it is never filing advice.

**Why:** The current Income Tax Department material distinguishes 12-month listed/equity holding
periods from the general 24-month period, section 50AA treatment for specified mutual funds, and
specific 2026 SGB conditions. Refusing insufficient contexts is more accurate and safer than
guessing a tax treatment from an asset name.

**Trade-off:** The first release supports fewer asset/tax combinations, but each displayed tax
estimate remains reproducible and conservative. Expansion requires dated legal review and golden
tests for each new classification.

## 18. Open questions that must be resolved before implementation

1. Which CAS issuer/layout does the user currently receive: CAMS, KFintech, MFCentral, CDSL, or NSDL?
2. Does the desired CAS import include transaction history since inception, or only current holdings? Exact tax estimates require acquisition lots.
3. Is a manual dealer-buyback valuation input needed in the first release for physical jewellery,
   in addition to the Gold API indicative spot reference?
4. What stale threshold should the UI use for a Gold API quote before it shows a warning?
5. Should physical jewellery record stone/non-metal weight separately in the first release?
6. Can the application require an explicit resident-individual declaration, and should the first
   rule table target tax year 2026-27?
7. Should asset funding with unknown units trigger a persistent reconciliation reminder after the expected allotment date?

These questions change provider choice or supported product behavior. They do not change the core separation of holdings, quotes, valuations, and estimates.

## 19. Legal and data-source basis as of 2026-08-23

Recheck every source at implementation time. Do not encode prose from this document without reviewing the current primary material.

- [AMFI daily NAV data (`NAVAll.txt`)](https://www.amfiindia.com/spages/NAVAll.txt)
- [AMFI explanation of NAV](https://www.amfiindia.com/investor/knowledge-center-info?zoneName=NetAssetValueNAV)
- [MFAPI.in documentation](https://www.mfapi.in/docs/)
- [IBJA rates](https://ibjarates.com/)
- [IBJA official rates API and usage guidance](https://www.indiagoldratesapi.com/)
- [Gold API price documentation](https://gold-api.com/docs)
- [Gold API free price terms](https://gold-api.com/terms)
- [MetalpriceAPI terms and commercial-use terms](https://metalpriceapi.com/terms)
- [GoldAPI XAU/INR endpoint information](https://www.goldapi.io/price/XAU/INR/json)
- [`pdf-parse` package documentation, including password-protected extraction](https://www.npmjs.com/package/pdf-parse)
- [Yahoo terms of service](https://legal.yahoo.com/xw/en/yahoo/terms/otos/index.html)
- [NSDL-hosted SEBI circular: revised CAS issuance timelines (February 2025)](https://nsdl.co.in/downloadables/pdf/2025-0022-Policy-SEBI_circular_-_Revised_timelines_for_issuance_of_Consolidated_Account_Statement_%28CAS%29.pdf)
- [CAMS consolidated account statement request](https://www.camsonline.com/Investors/Statements/CAS-CAMS)
- [KFintech consolidated account statement request](https://mfs.kfintech.com/investor/General/ConsolidatedAccountStatement)
- [CBIC GST sectoral FAQs](https://cbic-gst.gov.in/sectoral-faq.html)
- [Income Tax Department capital-gains FAQ for the post-23-July-2024 regime](https://incometaxindia.gov.in/Lists/Latest%20News/Attachments/673/FAQs%20-New-Capital-Gains-Taxation-regime.pdf)
- [Income Tax Department capital-gains guidance (2026)](https://wmstatic-prd.incometaxindia.gov.in/documents/20117/42998/Capital-Gain_2026-03-19_04-23-21_6cf0a8_en.pdf)
- [Income Tax Department SGB clarification for tax year 2026-27](https://www.incometaxindia.gov.in/documents/20117/15766092/FAQs-Budget-2026.pdf)
- [AMFI mutual-fund tax information](https://www.amfiindia.com/investor/knowledge-center-info?zoneName=TaxRegimeForMutualFunds)
- [Income Tax Department Budget 2026 FAQs, including SGB changes](https://incometaxindia.gov.in/Documents/Budget2026/FAQs-Budget-2026.pdf)

## 20. Definition of done

The overall initiative is done when:

- all five delivery phases have their own reviewed migrations/contracts/tests;
- external-provider and PDF dependencies have explicit approval and documented terms;
- no money or quantity path uses floating-point arithmetic;
- position history and valuation provenance are append-only and reproducible;
- CAS raw material and credentials are proven absent after retention TTL;
- every tenant boundary, retry, reversal, and concurrency invariant has an integration test;
- the application continues to function with stale quotes and no provider network;
- estimates clearly distinguish settlement cash from post-tax proceeds and decline unsupported cases;
- OpenAPI and the generated frontend client are current;
- documentation is updated in `BACKEND.md` and relevant deployment/operations docs; and
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm test:e2e` passes with zero errors.
