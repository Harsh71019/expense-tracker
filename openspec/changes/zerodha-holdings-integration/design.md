## Context

TreasuryOps is foundation-stage today (`AGENTS.md`/`CLAUDE.md`): only `auth`, `common/config`, `common/redis`, `common/errors`, `common/db`, `health` exist. No `integrations`, `imports`, or domain modules yet, and no field-level encryption anywhere in the codebase — existing secrets (`BETTER_AUTH_SECRET`, DB creds) are infra-level, handled via env + Vaultwarden + sops, not per-row DB secrets.

This is the first feature that needs to store a *user-supplied third-party credential* at rest, which is a new class of sensitive data distinct from the money-correctness invariants (`AGENTS.md` §3/§4) that dominate the rest of the codebase. It's also constrained by a hard external fact: Kite Connect has no service-account/refresh-token auth mode — Zerodha's own docs state daily user login is a regulatory requirement, not a technical limitation. That constraint shapes the UX (a connect button, not a "set and forget" integration) more than any code decision does.

Deployment context matters too: this runs on a home-lab Proxmox LXC that is not necessarily publicly reachable, and `pg_dump` backups are rclone'd off-box to B2/Drive weekly (`docs/backend/BACKEND.md` §"Disaster recovery"-adjacent notes) — so the credential-at-rest threat model is "backup exfiltration," not "attacker has a live shell" (game over regardless in that case).

## Goals / Non-Goals

**Goals:**
- Store Zerodha `api_key` / `api_secret` / `access_token` encrypted at rest, decryptable only by the app process holding the root key.
- Let the user complete Zerodha's official login flow from the existing TreasuryOps UI, with no new public network exposure.
- Detect an empty/expired `access_token` and reflect that in the UI (connect button) and via a scheduled reminder.
- Sync and display **holdings only** (qty, avg buy price) read-only.

**Non-Goals:**
- No fully automated / headless login (would require storing the actual Zerodha account password + TOTP seed — rejected, see Risks).
- No live valuation/LTP pricing (paid tier; deferred to a later change with a swappable price-source adapter).
- No writes to the transactions ledger or account balances — holdings are a separate read-only surface, not ledger entries.
- No support for brokers other than Zerodha in this change.

## Decisions

**1. Application-level AES-256-GCM, not pgcrypto.**
Rationale: keeps the key out of SQL entirely (no risk of it landing in `pg_stat_statements`/query logs), is unit-testable without a live DB (matches `AGENTS.md`'s testing bar), and mirrors this codebase's existing `common/<x>Service` pattern (`common/redis/`, `common/time/`) rather than introducing DB-side crypto as a new paradigm. Alternative considered: `pgcrypto` — rejected for the query-logging exposure and weaker testability.

**2. One encrypted JSON blob per provider row, not one column per secret.**
Table shape (conceptually): `integration_credentials(userId, provider, ciphertext, iv, authTag, keyVersion, updatedAt)`, where `ciphertext` decrypts to `{ apiKey, apiSecret, accessToken }`. Rationale: the next broker/provider will have a different credential shape; a blob avoids a migration per provider. Alternative considered: per-field columns — rejected as premature for a single-provider, single-user scale.

**3. Root key: new key, stored in Vaultwarden, separate from the existing age/sops key.**
Rationale: blast-radius isolation. The age key protects deploy-time infra secrets; this key protects user-data secrets. A single compromised key shouldn't unlock both categories. `keyVersion` column is included now so a future rotation is a decrypt-old/re-encrypt-new script, not a schema change — full envelope encryption (per-row DEK wrapped by a root KEK) is explicitly deferred; at 1-3 rows ever, direct root-key encryption is enough.

**4. Mutable table, not append-only.**
Unlike `transactions`, this data is expected to change (new `access_token` roughly daily). It sits outside the ledger's append-only/`withTxn` discipline entirely — it's config/credential state, not a money fact.

**5. `redirect_url` needs no public exposure.**
Zerodha's login redirect lands in the *user's own browser*, which then hits `redirect_url` — Zerodha's servers never connect to the homelab directly. Kite Connect explicitly supports `http://127.0.0.1:<port>/...` as a registered redirect URL for personal/local apps. Concretely: the redirect target can be the same origin the user already reaches TreasuryOps through today (LAN/Tailscale/reverse-proxied domain) — no new inbound route, no port-forward, same trust boundary as the rest of the app.

**6. Auth flow is user-driven, not scheduled.**
The cron only checks `access_token` presence/expiry (`~6:00 AM IST` fixed daily expiry, not rolling 24h) and fires a reminder/notification. It never attempts the login itself. The UI shows a "Connect Zerodha" button whenever the token is empty/expired; clicking it starts the official `kite.zerodha.com/connect/login` flow, and the backend completes `request_token` + checksum (`SHA256(api_key + request_token + api_secret)`) → `POST /session/token` → `access_token` on redirect callback.

**7. Holdings only, via the free Kite Connect Personal API; valuation deferred.**
Personal API (free) covers holdings/positions/orders but explicitly excludes market data (LTP/quotes) — that needs the paid ₹2000/mo plan. This change stores/display qty + avg buy price only. A later change can add current value via a separate, swappable, unauthenticated price-source adapter (candidates explored: Tickertape's unofficial internal endpoint, Yahoo-Finance-backed wrappers) — deliberately decoupled from Zerodha auth so a broken/ToS-shifted price source doesn't take down holdings sync.

## Risks / Trade-offs

- **[Risk] Full automation temptation.** Kite Connect has no `api_key`+`api_secret`-only auth path (confirmed against official docs) — the only way to remove the daily click is scripting Zerodha's actual consumer login (user_id + password + TOTP seed), which is a categorically bigger, less-revocable secret (full account takeover, not scoped API access) and rides on undocumented endpoints. → **Mitigation:** explicitly rejected as a non-goal above; keep the manual click but make it low-friction (one button + reminder notification).
- **[Risk] Backup exfiltration.** `pg_dump` leaves the box weekly to B2/Drive. → **Mitigation:** this is precisely why the credential column is encrypted at the application layer — a stolen dump is ciphertext without the root key, which never leaves Vaultwarden/the app's env.
- **[Risk] Nonce reuse in AES-GCM.** A reused IV with the same key breaks GCM's confidentiality guarantees. → **Mitigation:** `EncryptionService` must generate a fresh random IV per `encrypt()` call; cover this with a unit test asserting IV uniqueness across repeated calls.
- **[Trade-off] No envelope encryption (per-row DEK).** Simpler now, but rotating the root key later means a manual re-encrypt pass across all credential rows. Acceptable at current scale (single user, 1-3 provider rows); revisit if this ever becomes multi-tenant.
- **[Trade-off] Holdings-only scope means the portfolio view has no live value.** Users see "10 shares of X @ avg ₹Y" but not current worth until a follow-up change adds a price source.

## Open Questions

- Exact schema/module boundary for `integrations` vs. a more specific `integrations/zerodha` sub-module — decide at implementation time by re-reading `BACKEND.md` §8's module-layout conventions once this is picked up.
- Which price source to standardize on for a later valuation change (Tickertape unofficial vs. paid Kite data vs. another source) — deliberately left open, not blocking this change.
- Notification channel for the "reconnect Zerodha" reminder (in-app banner vs. push/email) — depends on whatever the `notifications` module looks like when it exists.
