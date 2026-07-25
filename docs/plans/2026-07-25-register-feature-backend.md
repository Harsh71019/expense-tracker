# Registration Feature — Backend Plan

Status: implemented on 2026-07-25

Target branch: `codex/register-feature-planning`

Companion plan: `docs/plans/2026-07-25-register-feature-frontend.md`

## Goal

Support safe, deployment-controlled email/password registration through the existing Better Auth integration. The backend must create exactly one Better Auth user and credential account, provision the matching TreasuryOps user profile, and leave all ledger data untouched.

## Current State

Most of the backend capability already exists:

- Better Auth is mounted at `/api/auth/*`.
- `emailAndPassword.enabled` is already `true`.
- `DISABLE_SIGNUP` already controls Better Auth's `disableSignUp` option and is validated in `common/config/env.ts`.
- The Drizzle schema already contains Better Auth's `user`, `account`, `session`, and `verification` tables.
- The `user.create.after` database hook calls `UserProfileService.ensure`.
- `AuthGuard` also calls `UserProfileService.ensure` after a successful session lookup, providing a repair path if the post-create hook failed.
- `/api/auth/sign-up/email` is already covered by the auth-specific rate limit of 10 attempts per minute.

The implementation should extend and test this setup, not introduce a custom password store, controller, JWT, or parallel registration service.

## Recommended Product Decisions

These decisions are part of the proposed implementation and should be confirmed during plan review:

1. Registration is available only while `DISABLE_SIGNUP=false`.
2. The minimum password length remains 8 and the maximum remains 128, matching the currently installed Better Auth behavior. Both values will be configured explicitly so a dependency upgrade cannot silently change the policy.
3. `autoSignIn` will be configured as `false`.
4. A successful registration sends the user to the login screen instead of creating an authenticated browser session.
5. An existing-email registration attempt receives the same outward success result as a new registration. With `autoSignIn=false`, Better Auth performs the password-hash work and returns a synthetic success response, reducing account-enumeration leakage.
6. Email verification, password reset, social login, passkeys, 2FA, invitations, and admin approval are outside this feature.

## API Contract

The frontend will use Better Auth's client, not the generated product API client:

| Item       | Contract                                                             |
| ---------- | -------------------------------------------------------------------- |
| Method     | `POST`                                                               |
| Path       | `/api/auth/sign-up/email`                                            |
| Owner      | Better Auth                                                          |
| Request    | `name`, `email`, `password`, optional `callbackURL` and `rememberMe` |
| Success    | Provider user response with a null token when `autoSignIn=false`     |
| Disabled   | Provider error code `EMAIL_PASSWORD_SIGN_UP_DISABLED`                |
| Rate limit | 10 requests per 60 seconds, stored in Redis secondary storage        |

This route stays outside `/api/v1/` because Better Auth owns the `/api/auth/*` namespace. It will not be added to the product OpenAPI registry and does not require `pnpm gen:client`.

The provider route follows the same auth-provider exception already used by sign-in and sign-out: no `Idempotency-Key` is added. The unique email constraint and Better Auth transaction prevent duplicate user effects, while `autoSignIn=false` gives duplicate-email attempts the same response posture without replaying session credentials.

## Data and Transaction Behavior

For a genuinely new email, Better Auth should perform the following:

1. Normalize and validate the email.
2. Validate the password against the configured length limits.
3. Hash the password using Better Auth's configured password implementation.
4. Create one `user` row.
5. Create one credential `account` row linked to that user.
6. Return without creating a session because `autoSignIn=false`.
7. Run the existing post-create hook to ensure one `user_profile` row.

No account, category, transaction, balance, audit-log, or other ledger row is created during registration. No migration is expected.

Better Auth owns the atomic user/credential write. The profile hook remains deliberately retryable: if it fails, it logs a warning without logging credentials, and the first successful authenticated request repairs the profile through `AuthGuard`.

## Implementation Tasks

### 1. Make registration policy explicit

Modify `apps/api/src/auth/auth.service.ts`:

- retain `enabled: true`;
- retain `disableSignUp: config.env.DISABLE_SIGNUP`;
- add `minPasswordLength: 8`;
- add `maxPasswordLength: 128`;
- add `autoSignIn: false`;
- retain the existing `/sign-up/email` rate-limit rule;
- retain the existing profile-provisioning hook.

No new dependency is required.

### 2. Expand auth configuration unit tests

Modify `apps/api/src/auth/__tests__/auth.service.test.ts`:

- assert the explicit minimum and maximum password lengths;
- assert `autoSignIn=false`;
- assert signup follows `DISABLE_SIGNUP`;
- add a disabled-signup configuration case;
- retain coverage for successful and failed profile provisioning;
- assert the sign-up rate-limit rule remains 10 requests per 60 seconds.

### 3. Add real-database registration integration coverage

Create `apps/api/test/integration/auth/registration.integration.ts`.

Use the existing Testcontainers Postgres helper and the real Better Auth Drizzle adapter. Provide a purpose-built in-memory `RedisService` test double implementing only the secondary-storage methods registration uses.

Cover:

- a new email creates one user and one credential account;
- the stored credential is a hash and never equals the submitted password;
- the email is normalized;
- the profile provisioning hook receives the created user's id and name;
- no session is created when `autoSignIn=false`;
- a second request for the same email does not create a second user or credential account and returns the generic success posture;
- a password shorter than 8 or longer than 128 is rejected without a partial user;
- `DISABLE_SIGNUP=true` rejects registration without any database write;
- five parallel attempts with the same email produce exactly one user and one credential account;
- `assertInvariants()` is called at the end, even though the flow must not create ledger entries.

The test should call the real Better Auth server API rather than duplicating its internal SQL.

### 4. Update behavior documentation

When implementation starts, update:

- `docs/design-briefs/13-auth.md` to replace the login-only posture with deployment-controlled self-registration;
- `docs/backend/BACKEND.md` if its auth section states that signup is not exposed;
- `env.example` only if the explanation of `DISABLE_SIGNUP` needs clarification.

No environment variable is added, so the env zod schema and deployment files should otherwise remain unchanged.

## Security Requirements

- Never log the password, credential hash, raw request body, session token, or verification token.
- Do not accept a user id from the registration request.
- Do not create a custom cookie or JWT.
- Keep trusted-origin checks and secure-cookie behavior under the existing Better Auth configuration.
- Preserve the existing auth rate limiter and Redis-backed secondary storage.
- Do not expose a distinguishable "email already registered" result.
- Keep registration disabled in deployments that set `DISABLE_SIGNUP=true`.
- Do not add ledger initialization writes as a side effect of identity creation.

## Verification

Run the repository definition-of-done gates:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
```

Also run the focused tests while iterating:

```bash
pnpm --filter @treasury-ops/api test -- src/auth/__tests__/auth.service.test.ts
pnpm --filter @treasury-ops/api test:integration -- test/integration/auth/registration.integration.ts
```

## Backend Acceptance Criteria

- Registration uses `/api/auth/sign-up/email`; no parallel auth endpoint exists.
- `DISABLE_SIGNUP` is the authoritative deployment switch.
- Password limits and no-auto-sign-in behavior are explicit and tested.
- New registration creates exactly one user, one credential account, and an ensured profile.
- Duplicate and parallel attempts cannot create duplicate identities.
- Registration creates no session and reveals no existing-email distinction.
- No schema migration, generated product client, or ledger write is introduced.
- All repository quality gates pass with zero type and lint errors.
