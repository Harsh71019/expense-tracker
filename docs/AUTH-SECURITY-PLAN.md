# Vyaya Authentication and Security Plan

> Status: design proposal for review. No implementation is authorized by this document.
>
> Reviewed against the repository on 2026-07-16 and Better Auth 1.6 documentation. The
> lockfile currently resolves `better-auth` 1.6.23. Re-check the installed API before
> implementation and pin compatible package versions instead of adding another `latest` range.

## 1. Objective

Harden the existing Better Auth deployment in this order:

1. close foundational session, cookie, proxy, recovery, logging, and rate-limit gaps;
2. add TOTP two-factor authentication with single-use backup codes;
3. add passkeys with required user verification;
4. add security-management UI, session revocation, audit events, and recovery runbooks;
5. only then consider making passwords optional.

Vyaya contains financial data, so the design favors fail-closed behavior, explicit recovery,
short sensitive-operation windows, and phishing-resistant authentication. It does not build a
parallel auth system around Better Auth.

## 2. Current Baseline

The repository already has a sound starting point:

- Better Auth owns `/api/auth/*` inside the NestJS process.
- Authentication is cookie-based; controllers are protected by a global `AuthGuard`.
- The authenticated `userId` comes from the session, never from a request body.
- MongoDB is the primary Better Auth database.
- Redis is configured as Better Auth secondary storage and rate-limit storage.
- `trustedOrigins`, `BETTER_AUTH_URL`, secure-cookie behavior, and signup disabling are
  validated environment settings.
- Production traffic enters through one same-origin proxy: browser `/api/*` requests and the
  Next.js frontend share the public origin.
- Helmet, strict CORS, request IDs, and Pino redaction are present.
- Sign-in and sign-up currently have Redis-backed rate limits.

Known gaps:

- no two-factor server or client plugin;
- no passkey package, server plugin, client plugin, or WebAuthn configuration;
- no 2FA enrollment, challenge, recovery, passkey, or session-management screens;
- no explicit session lifetime/freshness policy;
- no versioned Better Auth secret rotation;
- no authentication security-event trail;
- current logging redaction does not explicitly cover TOTP codes, backup codes, TOTP URIs,
  WebAuthn challenges, or credential payloads;
- public signup is configurable but the deployment runbook does not make its post-bootstrap
  shutdown a release gate.

## 3. Threat Model

This plan protects primarily against:

- password reuse, credential stuffing, and brute-force attempts;
- phishing of the password and TOTP code;
- stolen or replayed session cookies;
- CSRF, untrusted-origin requests, and open redirects;
- spoofed client IP headers that bypass rate limiting;
- an attacker adding a passkey or disabling 2FA from a stale stolen session;
- device loss and unsafe account-recovery shortcuts;
- secrets or recovery material reaching logs;
- malicious cross-tenant access after authentication.

This plan does not claim to protect a fully compromised browser, phone, operating system,
MongoDB administrator, or server root account. Infrastructure access control, backups, patching,
and endpoint security remain separate controls.

## 4. Decisions Proposed for Approval

| Area                          | Proposed decision                                                        | Reason                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| First second factor           | TOTP only                                                                | No email/SMS delivery dependency; stronger than email OTP for this deployment.                                      |
| Backup codes                  | Required during enrollment                                               | Prevents an unsafe administrator bypass when the TOTP device is lost.                                               |
| Trusted devices               | Disabled in the first release                                            | Better Auth remembers a trusted device for 30 days; that weakens the intended baseline.                             |
| 2FA enrollment                | Password re-entry + fresh session + verified first TOTP                  | Prevents a stale stolen session from silently enrolling an attacker-controlled factor.                              |
| Passkey registration          | Authenticated session required                                           | Do not enable passkey-first/pre-auth registration for this application.                                             |
| Passkey user verification     | `required`                                                               | Requires biometric/PIN/security-key verification rather than possession alone.                                      |
| Authenticator support         | Platform and cross-platform                                              | Supports Face ID/Touch ID plus hardware security keys.                                                              |
| Discoverable credential       | `residentKey: "preferred"`                                               | Good conditional-UI support without excluding older authenticators.                                                 |
| Passkey versus 2FA            | Passkey is an alternative strong sign-in; password sign-in requires TOTP | Better Auth does not gate passkey sign-in with 2FA by default; a verified passkey is phishing-resistant.            |
| Password removal              | Not in the first passkey release                                         | Recovery must be proven with at least two passkeys plus backup codes first.                                         |
| Session store                 | Keep server-side sessions in Redis; no cookie cache initially            | Immediate revocation is more important than avoiding a Redis lookup. Redis loss safely logs users out.              |
| Session lifetime              | 24-hour absolute session, no sliding refresh initially                   | Tight baseline for financial data; passkeys later make reauthentication low-friction.                               |
| Sensitive-operation freshness | Five minutes                                                             | Passkey/2FA changes, password changes, backup-code display, and mass session revocation need recent authentication. |
| Signup                        | Enabled only for initial bootstrap; disabled in production afterward     | Vyaya is personal and does not need an internet-facing registration surface.                                        |

If a 24-hour absolute session is too disruptive during the TOTP-only phase, the acceptable
fallback is a three-day absolute session. A seven-day sliding session is not the recommended
tight-security default.

## 5. Authentication Model

### 5.1 Password path

```text
email + password
      |
      v
Better Auth credential verification + rate limit
      |
      v
TOTP or one unused backup code
      |
      v
server-side session cookie issued
```

For an account with `twoFactorEnabled`, no authenticated session may exist between successful
password verification and successful second-factor verification. Better Auth already follows
this model for credential sign-in endpoints.

### 5.2 Passkey path

```text
passkey selection
      |
      v
WebAuthn challenge bound to Vyaya RP ID and exact origin
      |
      v
authenticator verifies user with biometric/PIN/security key
      |
      v
server verifies challenge, origin, RP ID, signature, and counter
      |
      v
server-side session cookie issued
```

Better Auth 1.6 does **not** apply its 2FA challenge to passkey and other passwordless sign-ins by
default. This plan accepts a passkey configured with `userVerification: "required"` as the
phishing-resistant sign-in method. Password sign-in continues to require TOTP.

If policy later requires passkey **and** TOTP on every login, implementation must add and test a
custom post-passkey challenge. Merely enabling both plugins does not provide that behavior.

### 5.3 Step-up for security settings

The following actions require a session created or reauthenticated within five minutes:

- enable or disable 2FA;
- view or regenerate backup codes;
- add or delete a passkey;
- change password or recovery email;
- revoke all sessions;
- disable the final remaining sign-in method.

Where Better Auth's built-in fresh-session check is insufficient for the desired UX, add an
application-owned `authStrength`/`reauthenticatedAt` check through a validated session extension
or a short-lived, server-side step-up grant. Never accept a client-supplied boolean.

## 6. Phase A — Foundational Hardening

Complete this before enabling either plugin.

### 6.1 Pin and verify packages

- Replace auth-related `latest` ranges with reviewed compatible versions.
- Keep `better-auth` identical in API and web workspaces.
- Add `@better-auth/passkey` only in the passkey phase and pin it compatibly.
- Review Better Auth release notes before upgrades; regenerate and diff the auth schema.
- Keep the lockfile committed and run dependency and image vulnerability scans in CI.

### 6.2 Cookie and origin policy

- Production must use HTTPS and `AUTH_COOKIE_SECURE=true`.
- Keep cookies `httpOnly` and `secure`.
- Prefer host-only cookies; do not enable cross-subdomain cookies for the current same-origin
  topology.
- Keep SameSite at Better Auth's safe default unless a tested flow requires a stricter value.
  Do not set `SameSite=None` for this deployment.
- Keep CSRF and origin checking enabled. Never set `disableCSRFCheck` or
  `disableOriginCheck`.
- `TRUSTED_ORIGINS` must be an exact allowlist. Do not use wildcard production origins.
- `BETTER_AUTH_URL` must be the external HTTPS URL including `/api/auth`, not the internal
  container URL.
- Keep frontend auth requests same-origin through `/api`; this also avoids third-party-cookie
  and Safari ITP failures.

### 6.3 Proxy and client IP trust

- The API container must remain unreachable directly from the internet.
- Every trusted proxy must overwrite, not append blindly to, the header selected for client IP.
- Continue using a single sanitized header such as `X-Real-IP` in Better Auth.
- Document the NPMplus -> inner nginx -> API chain and verify the final API sees the real client
  IP, not the outer proxy IP.
- Never trust a broad private CIDR that includes possible clients.
- Add an integration/deployment check proving a caller cannot spoof the rate-limit identity by
  sending its own `X-Real-IP` or `X-Forwarded-For`.

### 6.4 Session policy

Proposed Better Auth behavior:

- `expiresIn`: 24 hours;
- `disableSessionRefresh`: true, giving an absolute lifetime;
- `freshAge`: five minutes;
- no session cookie cache initially;
- list active sessions with device/IP metadata;
- allow revoking one session, other sessions, or all sessions;
- revoke other sessions on password change;
- revoke sessions on password reset;
- revoke all existing sessions after 2FA disable, password recovery, suspected compromise, or
  removal of the final trusted passkey.

Redis is currently Better Auth secondary storage. With secondary storage configured, Better Auth
uses it for session data by default. Redis restart/data loss therefore logs users out; that is a
safe failure mode. Redis still needs authentication, network isolation, memory limits, and a
documented persistence choice.

Do not enable a long-lived cookie session cache during this hardening work. Better Auth documents
that revoked sessions can remain usable until such a cache expires.

### 6.5 Password and recovery policy

- Keep Better Auth's default scrypt password hashing unless a reviewed migration changes it.
- Set explicit minimum and maximum password lengths; proposed values are 12 and 128.
- Do not add composition rules such as “one symbol and one number.” Allow password-manager output
  and long passphrases.
- Disable public signup immediately after the owner account is created.
- If password reset is implemented, use short-lived, single-use tokens, generic responses that do
  not reveal account existence, and `revokeSessionsOnPasswordReset`.
- Do not use security questions.
- Do not provide an undocumented database edit or support bypass for 2FA recovery.

### 6.6 Secret rotation

- Add validated support for `BETTER_AUTH_SECRETS` using versioned secrets.
- Keep the old `BETTER_AUTH_SECRET` only as a temporary legacy-decryption fallback during the
  first rotation.
- Store secrets only in deployment secret configuration.
- Rotate by adding a new highest version first, deploy, verify decryption, then retire old keys
  after the maximum relevant data lifetime.
- A lost TOTP encryption key can lock out the account; secret backup belongs in the disaster
  recovery runbook.

### 6.7 Rate limits and lockout

Keep Redis-backed rate limiting enabled in every environment used for security testing.

Minimum policy:

| Endpoint class            | Limit                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| Email sign-in             | 5 attempts / 15 minutes per sanitized IP, with Better Auth's tighter built-in burst rule retained |
| TOTP/backup verification  | Retain plugin burst limits and account-level lockout; never disable lockout                       |
| Passkey challenge/sign-in | 10 / minute per IP                                                                                |
| Password reset request    | 3 / hour per IP and normalized account identifier                                                 |
| 2FA enable/disable        | 5 / hour per authenticated user                                                                   |
| Passkey add/delete        | 10 / hour per authenticated user                                                                  |
| Global auth traffic       | Existing 100 / minute ceiling                                                                     |

The Better Auth 1.6 2FA plugin includes account-level lockout fields and shares the failure counter
across TOTP, OTP, and backup-code verification. Confirm its configured defaults in the installed
version and add tests for `429` behavior.

### 6.8 Logging and security events

Never log:

- passwords or password hashes;
- TOTP secrets or `otpauth://` URIs;
- TOTP/OTP verification codes;
- backup codes, used or unused;
- session cookies or session tokens;
- WebAuthn challenges, authenticator responses, public-key blobs, or credential IDs unless a
  specifically reviewed diagnostic requires a hashed identifier.

Extend redaction paths before plugin routes go live. Error responses must remain generic and must
not expose whether an email, passkey, or second factor exists.

Record append-only security events without secret material:

- sign-in success/failure and lockout;
- 2FA enrollment started/completed/disabled;
- backup codes regenerated or consumed (never the code);
- passkey added/renamed/deleted;
- password changed/reset;
- session revoked/all sessions revoked;
- signup enabled/disabled deployment state if operationally available.

Suggested event fields are `eventId`, `userId?`, `event`, `result`, `requestId`, `ipAddress`,
`userAgent`, `authMethod?`, `credentialFingerprint?`, `at`, and a small typed `meta`. Apply a
retention policy to IP/user-agent data and never place these events in the monetary ledger.

## 7. Phase B — TOTP Two-Factor Authentication

### 7.1 Better Auth integration

Server:

- enable the `twoFactor` plugin from `better-auth/plugins`;
- set the application/issuer name to `Vyaya`;
- keep `skipVerificationOnEnable` false;
- keep password verification required for credential accounts;
- do not configure email/SMS OTP in the first version;
- keep account lockout enabled;
- choose backup-code count and length from the installed plugin's supported options, favoring at
  least ten high-entropy single-use codes.

Client:

- add `twoFactorClient`;
- route credential sign-ins with `twoFactorRedirect` to a dedicated `/two-factor` page;
- support TOTP and backup-code entry as visibly distinct recovery choices;
- never put TOTP secrets, codes, or backup codes into URLs, query strings, analytics, or client
  logs.

### 7.2 Enrollment flow

1. Require a fresh authenticated session and current password.
2. Generate the TOTP URI and backup codes through Better Auth.
3. Render the QR code locally in the browser; do not send the URI to an external QR service.
4. Require the user to save or print backup codes.
5. Require one valid TOTP code before `twoFactorEnabled` becomes true.
6. Revoke other sessions after successful enrollment.
7. Record a secret-free `auth.2fa.enabled` security event.

If the user abandons enrollment before verification, the account must remain usable with its
previous authentication method and the unverified enrollment must not silently enable 2FA.

### 7.3 Sign-in and recovery

- Password success for a 2FA-enabled user must lead only to the second-factor challenge.
- TOTP codes should accept only the plugin's documented small clock-skew window.
- A backup code is single-use and is removed after verification.
- Regenerating backup codes invalidates all previous backup codes.
- Viewing existing codes requires a fresh session and must not be possible from a generic API
  client without recent authentication.
- “Trust this device” is not shown in the first release.
- After repeated failures, return a generic lockout message and `429`; do not reveal which factor
  was correct.

### 7.4 Required data changes

Better Auth 1.6 documents:

- optional `twoFactorEnabled: boolean` on its managed `user` record;
- a managed `twoFactor` collection containing `id`, `userId`, encrypted `secret`, encrypted/stored
  `backupCodes`, `verified`, `failedVerificationCount`, and optional `lockedUntil`.

Repository policy requires all schema changes to go through `migrate-mongo`. During
implementation:

1. use Better Auth's schema generation only as a reference;
2. inspect the exact schema expected by the pinned 1.6.23-compatible packages;
3. write an additive project migration under `migrations/`;
4. add indexes expected by the adapter/plugin without guessing field names or uniqueness;
5. verify upgrade against a production-like Mongo replica set;
6. never hand-edit Atlas.

Do not copy TOTP state into `user_profiles`.

## 8. Phase C — Passkeys

### 8.1 Relying-party configuration

Production WebAuthn values must be explicit and environment-validated:

- `rpName`: `Vyaya`;
- `rpID`: the public hostname only, with no scheme, port, or path;
- `origin`: the exact public HTTPS origin, with no trailing slash;
- local development origin: the exact browser-visible localhost origin;
- no wildcard production origin.

Because nginx exposes the frontend and `/api` on one public origin, the current topology is a good
fit for WebAuthn. Test the actual browser-visible origin through NPMplus; do not derive security
values from an internal `api:4000` URL or an untrusted `Host` header.

### 8.2 Plugin policy

- install the pinned `@better-auth/passkey` package;
- add the `passkey` server plugin and `passkeyClient` client plugin;
- leave registration session-required;
- set `userVerification: "required"`;
- set `residentKey: "preferred"`;
- allow both platform and cross-platform authenticators;
- retain signature-counter checks;
- use short, server-bound challenges and the plugin's secure challenge cookie;
- do not enable passkey-first account creation;
- do not request attestation or restrict AAGUIDs in the first release unless a concrete policy
  requires managed hardware.

### 8.3 Registration and management

1. Require a fresh session and, while password exists, password/TOTP step-up.
2. Ask for a user-readable name such as “Harsh iPhone” or “YubiKey backup.”
3. Complete WebAuthn verification before persisting the credential.
4. Show credential name, creation date, device type, backup state, and last-used time if the
   installed plugin supports it without custom mutation.
5. Allow rename and delete only after fresh authentication.
6. Never allow deletion of the final usable sign-in method.
7. Recommend at least two passkeys on different failure domains before password removal: for
   example, an iCloud-synced platform passkey plus a hardware key.

Conditional UI may be enabled after normal sign-in works. The login input must use
`autocomplete="username webauthn"`, with `webauthn` last.

### 8.4 Required data changes

Better Auth documents a managed `passkey` collection with:

- `id`;
- optional `name`;
- `publicKey`;
- `userId`;
- unique credential identifier;
- signature counter;
- device type;
- backup state;
- optional transports;
- optional creation time;
- optional AAGUID.

As with 2FA, generate and inspect the pinned plugin schema, then implement it through an additive
`migrate-mongo` migration. At minimum, the resulting storage must efficiently query by `userId`
and prevent duplicate credential identifiers according to the plugin's expected representation.
Public-key material is not secret, but it is still authentication data and must not be emitted in
normal API responses or logs.

## 9. Recovery Policy

Recovery is part of authentication, not an afterthought.

Approved recovery paths:

1. another registered passkey;
2. password plus an unused backup code while password sign-in remains enabled;
3. an offline owner-operated disaster-recovery procedure using verified database and secret
   backups.

Not approved:

- security questions;
- support/operator bypass based only on email;
- manually setting `twoFactorEnabled=false` in Atlas;
- emailing a TOTP secret or backup code;
- keeping plaintext recovery material in project docs, logs, screenshots, or passwordless notes.

The owner should store backup codes offline in a password manager or printed secure location, and
test one recovery path before depending on it. A recovery drill must use a replaceable code and
regenerate codes afterward.

## 10. API, Error, and UI Requirements

- Better Auth continues to own `/api/auth/*`; do not wrap every plugin route in hand-written Nest
  controllers.
- Application security-management endpoints, if any, remain under `/api/v1/` and use shared Zod
  contracts plus RFC 7807 errors.
- Add stable application mappings for invalid code, lockout, passkey failure, stale session, and
  last-authenticator removal without revealing account existence.
- Update OpenAPI only for application-owned routes. Do not pretend generated business-client
  types cover Better Auth's vendor-owned routes.
- Authentication pages must handle browser cancellation, unsupported WebAuthn, expired challenge,
  clock skew, offline state, and retry without duplicate enrollment.
- No secret value may enter React Query cache, persistent browser storage, analytics, or error
  reporting.

## 11. Verification Plan

### 11.1 Unit and integration tests

- plugin configuration is present only with validated environment values;
- signup-disabled production behavior;
- exact trusted-origin allowlist and CSRF rejection;
- real client IP extraction through trusted proxy headers;
- password sign-in requires TOTP when enabled;
- no session exists before second-factor success;
- incorrect TOTP and backup codes increment shared lockout state;
- lockout returns `429` and expires correctly;
- backup code succeeds once and fails on reuse;
- abandoned enrollment does not enable 2FA;
- disabling 2FA requires fresh authentication and revokes sessions;
- passkey registration requires an authenticated fresh session;
- wrong origin, RP ID, challenge, counter, or user verification fails;
- duplicate credential registration fails;
- passkey delete is user-scoped and cannot remove the final sign-in method;
- cross-tenant attempts cannot list, rename, or delete another user's passkeys/sessions;
- secrets and codes are absent from logs and problem responses.

### 11.2 Browser/e2e tests

- password + TOTP happy path;
- backup-code recovery;
- lockout and recovery after expiry;
- passkey registration and sign-in with an emulated authenticator;
- conditional UI where the browser supports it;
- Safari/iPhone same-origin production topology;
- session list and single/all-session revocation;
- expired session and stale-session step-up;
- proxy/origin behavior through the production nginx path.

### 11.3 Release gates

- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm test:e2e`;
- migration tested on a replica-set fixture and a restored staging copy;
- owner has verified backup codes before 2FA is enforced;
- at least two recovery methods exist before password is disabled;
- public signup is confirmed disabled after bootstrap;
- rollback restores the previous login method without deleting auth data.

## 12. Implementation Order

1. Pin auth packages and add session/origin/proxy/logging hardening.
2. Add versioned secret support and session-management UI.
3. Add the reviewed 2FA migration and server/client plugins.
4. Ship TOTP enrollment, challenge, backup-code, and recovery flows.
5. Run a recovery drill and observe the deployment before adding passkeys.
6. Add the reviewed passkey migration and explicit RP configuration.
7. Ship passkey registration/management, then passkey sign-in.
8. Add conditional UI after ordinary passkey sign-in is stable.
9. Consider password removal only after two independent passkeys and recovery testing.

Each numbered item should be a separate reviewable change. Do not combine authentication schema
migrations with unrelated ledger feature work.

## 13. Explicit Non-Goals

- custom JWT authentication;
- storing authentication state in `user_profiles`;
- SMS or email OTP in the first 2FA release;
- social login;
- passkey-first public signup;
- broad cross-subdomain cookies;
- disabling Better Auth CSRF/origin checks;
- administrator impersonation or a hidden recovery bypass;
- deleting passwords immediately after the first passkey registration.

## 14. Review Questions

Before implementation, approve or change these choices:

- Is a 24-hour absolute session acceptable, or should the TOTP-only phase use three days?
- Should trusted devices remain disabled permanently?
- Is a verified passkey accepted as the complete sign-in method, or must every passkey login also
  require TOTP through custom hooks?
- Must the owner register two passkeys before the passkey feature is considered complete?
- Should password reset email be implemented, or is offline backup-code/passkey recovery enough
  for this personal deployment?
- What exact public hostname will be the WebAuthn RP ID?

## 15. Primary References

- [Better Auth two-factor plugin](https://better-auth.com/docs/plugins/2fa)
- [Better Auth passkey plugin](https://better-auth.com/docs/plugins/passkey)
- [Better Auth session management](https://better-auth.com/docs/concepts/session-management)
- [Better Auth security reference](https://better-auth.com/docs/reference/security)
- [Better Auth cookies](https://better-auth.com/docs/concepts/cookies)
- [Better Auth rate limiting](https://better-auth.com/docs/concepts/rate-limit)
- [Better Auth options and versioned secrets](https://better-auth.com/docs/reference/options)
