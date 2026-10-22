## 1. Encryption foundation

- [ ] 1.1 Add `FIELD_ENCRYPTION_KEY` to `RuntimeEnvSchema` (`apps/api/src/common/config/env.ts`), validated at boot, documented in `env.example`
- [ ] 1.2 Create `apps/api/src/common/crypto/encryption.service.ts` — AES-256-GCM `encrypt(plaintext)` / `decrypt(payload)`, random IV per call, returns/accepts `{ ciphertext, iv, authTag, keyVersion }`
- [ ] 1.3 Unit tests: roundtrip encrypt/decrypt, distinct IV per call across repeated invocations, decrypt fails on tampered ciphertext/authTag
- [ ] 1.4 Generate and store the root key in Vaultwarden (separate entry from the existing age/sops key); document the separation in deploy notes

## 2. Credential storage

- [ ] 2.1 Drizzle migration: `integration_credentials` table (`userId`, `provider`, `ciphertext`, `iv`, `authTag`, `keyVersion`, `createdAt`, `updatedAt`), unique on `(userId, provider)`
- [ ] 2.2 `apps/api/src/integrations/integrations.repository.ts` — `userId`-scoped methods: `getCredential(userId, provider)`, `upsertCredential(userId, provider, payload)`, `clearCredential(userId, provider)`
- [ ] 2.3 `apps/api/src/integrations/integrations.service.ts` — encrypts before writing, decrypts after reading, never returns plaintext beyond the service boundary
- [ ] 2.4 Repository/service unit tests using the `common/crypto` service (no live DB required for crypto logic; use existing DB test patterns for repository methods)

## 3. Zerodha connect flow (backend)

- [ ] 3.1 `apps/api/src/integrations/zerodha/` module: controller endpoints to (a) start login (redirect to `kite.zerodha.com/connect/login?v=3&api_key=...`) and (b) handle callback with `request_token`
- [ ] 3.2 Implement checksum computation (`SHA256(apiKey + requestToken + apiSecret)`) and `POST /session/token` exchange to obtain `access_token`
- [ ] 3.3 On successful exchange, encrypt and upsert the credential via `integrations.service`
- [ ] 3.4 Confirm `redirect_url` works against the app's existing LAN/Tailscale/reverse-proxy origin — no new public route opened
- [ ] 3.5 Integration test: callback with a valid `request_token` results in an encrypted stored credential; callback never accepts/stores a raw password or TOTP value

## 4. Expiry detection and reminder

- [ ] 4.1 Add a BullMQ cron job that checks each user's `access_token` against the fixed 6:00 AM IST daily expiry
- [ ] 4.2 On missing/expired token, record/surface a reminder (mechanism TBD per design's Open Questions — start with an in-app flag the UI can read)
- [ ] 4.3 Unit test: cron correctly classifies token as valid/expired at the boundary time; cron never attempts a login itself

## 5. Holdings sync (read-only)

- [ ] 5.1 `apps/api/src/integrations/zerodha/holdings.service.ts` — calls Kite Connect Personal API holdings endpoint using the decrypted `access_token`
- [ ] 5.2 Map response to a read-only DTO (instrument, quantity, average buy price) — no persistence into `transactions`/`accounts` tables
- [ ] 5.3 Controller endpoint `GET /integrations/zerodha/holdings` — returns empty/"not connected" state distinctly from an empty holdings list
- [ ] 5.4 Test confirming a holdings sync never inserts ledger rows or mutates `balanceMinor`

## 6. Frontend

- [ ] 6.1 Integrations page/section: "Connect Zerodha" button shown when `access_token` is empty/expired (per design decision 6)
- [ ] 6.2 Wire button to backend login-start endpoint; handle redirect back into the app
- [ ] 6.3 Holdings read-only table/list view (instrument, qty, avg buy price) — explicitly no current-value column (out of scope, see design Non-Goals)
- [ ] 6.4 Reminder banner/indicator driven by the expiry-check flag from task 4.2
- [ ] 6.5 Manual browser check: full flow — no token → click connect → Zerodha login → redirect → holdings visible; token expiry → button reappears

## 7. Docs

- [ ] 7.1 Update `env.example` and any deploy runbook with `FIELD_ENCRYPTION_KEY` setup steps and the Vaultwarden key-separation note
- [ ] 7.2 Note in `BACKEND.md`/module docs that `integrations` is now implemented (foundation-stage doc currently lists it as not-yet-built)
