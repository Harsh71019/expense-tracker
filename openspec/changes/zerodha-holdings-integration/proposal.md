## Why

TreasuryOps tracks cash/bank/credit accounts but has no visibility into equity/mutual fund holdings, which live in a Zerodha demat account. Manually re-entering holdings defeats the point of an automated ledger. Zerodha's Kite Connect API can supply this, but its auth model (mandatory daily user login, no refresh-token/service-account path) shapes the whole design — this proposal captures that shape now so implementation can start later without re-deriving the constraints.

## What Changes

- Add a new `integrations` module (first consumer: Zerodha) storing one encrypted credential row per user per provider (`api_key`, `api_secret`, `access_token`), following the controller → service → repository layering and `userId`-scoped repository methods required by `AGENTS.md`.
- Add a `common/crypto` module: `EncryptionService` doing AES-256-GCM at the application layer (never pgcrypto/DB-level), keyed by a new `FIELD_ENCRYPTION_KEY` env var validated at boot via `RuntimeEnvSchema`, kept in Vaultwarden **separate from** the existing age/sops key used for infra secrets.
- Add a "Connect Zerodha" UI affordance: shown whenever the stored `access_token` is empty/expired; clicking it drives the user through Zerodha's official browser login (`kite.zerodha.com/connect/login`), completes the `request_token` → `access_token` exchange server-side, and stores the result.
- Add a scheduled check (BullMQ cron) that detects a missing/expired `access_token` and surfaces a reminder/notification — it never performs the login itself; Zerodha's flow requires an actual daily human login, no fully headless alternative exists for Kite Connect (confirmed against official docs — this is a regulatory requirement, not an API limitation).
- Pull and display **holdings only** (quantity, average buy price) via Zerodha's free Kite Connect Personal API. Current market value/LTP is explicitly **out of scope** for this change (that tier requires the paid ₹2000/mo Kite Connect data plan) — deferred to a later change, likely via an unauthenticated third-party price source kept behind a swappable adapter.
- Holdings are shown as a **read-only portfolio view**, separate from the append-only transactions ledger — Zerodha data never creates ledger transactions or touches account balances in this change.

## Capabilities

### New Capabilities
- `zerodha-integration`: storing an encrypted Zerodha credential per user, the connect/login flow, expiry detection + reminder, and a read-only holdings sync/display.

### Modified Capabilities
(none — no existing specs yet in this repo)

## Impact

- **New code**: `apps/api/src/integrations/` (controller, service, repository), `apps/api/src/common/crypto/` (`EncryptionService`), a new Drizzle migration for the credentials table, a new BullMQ cron job, `apps/web` UI for the connect button + holdings view.
- **Config**: new required env var `FIELD_ENCRYPTION_KEY` in `RuntimeEnvSchema`/`env.example`.
- **Explicitly not touched**: `transactions`/ledger tables, account balances, `withTxn` money-write path — this change is additive and read-only with respect to the existing ledger.
- **Deferred/out of scope**: any broker beyond Zerodha, live valuation/LTP pricing, fully automated (no-human-click) authentication (rejected — would require storing the real Zerodha account password + TOTP seed, a materially riskier secret, for gray-area/ToS-risky automation of Zerodha's consumer login page).
