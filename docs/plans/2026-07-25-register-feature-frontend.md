# Registration Feature — Frontend Plan

Status: planning only

Target branch: `codex/register-feature-planning`

Companion plan: `docs/plans/2026-07-25-register-feature-backend.md`

## Goal

Add a polished, accessible `/register` flow that matches the existing TreasuryOps login experience, calls Better Auth directly, preserves safe return paths, and sends successful registrants to sign in.

## User Flow

1. An unauthenticated user opens `/register`, optionally with `?next=<internal path>`.
2. The user enters display name, email, password, and password confirmation.
3. The browser performs local usability validation, then calls `authClient.signUp.email`.
4. On provider success, the app redirects to `/login?registered=1&next=<safe path>`.
5. Login shows a success notice and the user signs in normally.
6. After sign-in, the existing login flow sends the user to the safe `next` path.

The frontend must not claim whether the email was newly created or already existed. The success message should be neutral: "If this email can be registered, your account is ready. Sign in to continue."

## Current State and Required Changes

The current auth route group is login-specific:

- `(auth)/layout.tsx` owns the "Welcome back" heading and sign-in copy.
- `LoginForm` owns the credential form.
- `proxy.ts` excludes `/login` but currently treats `/register` as protected.
- `getSafeCallbackPath` already rejects external and malformed return paths.
- `authClient` already exposes the Better Auth React client and request-id logging hooks.

The implementation should reuse these foundations. It should not use the generated `/api/v1` client, add a handwritten `fetch`, or add a UI dependency.

## Page and Component Design

### Shared auth shell

Refactor `apps/web/src/app/(auth)/layout.tsx` so it owns only the shared visual shell:

- theme toggle;
- TreasuryOps brand;
- card, background glow, and ledger hero;
- footer/security copy;
- a neutral content slot.

Move route-specific heading and description content into the login and register pages. This avoids route inspection in the layout and keeps both pages server components except for their interactive forms.

### Login page

Update `apps/web/src/app/(auth)/login/page.tsx` to render:

- "Welcome back";
- the current sign-in description;
- `LoginForm`.

Update `LoginForm` to:

- show a non-error status notice when `registered=1`;
- include "Need an account? Register" beneath the form;
- preserve the sanitized `next` value in the register link;
- retain the current hydration guard, remember-me behavior, provider errors, toast behavior, and safe redirect logic.

### Register page

Create `apps/web/src/app/(auth)/register/page.tsx` with:

- heading "Create your account";
- concise copy explaining that registration may be disabled by the deployment owner;
- `RegisterForm`;
- a "Already have an account? Sign in" link that preserves the safe `next` value.

Create `apps/web/src/features/auth/components/register-form.tsx` as a client component.

Fields:

- display name: required, trimmed before submission, `autoComplete="name"`;
- email: required, `type="email"`, normalized by the provider, `autoComplete="email"`;
- password: required, 8–128 characters, `autoComplete="new-password"`;
- confirm password: required, `autoComplete="new-password"`;
- a password visibility control with an accessible name.

Behavior:

- use the same pre-hydration submit guard as `LoginForm` so passwords can never fall back to a native GET submission;
- disable the submit button while pending;
- reject mismatched passwords locally without calling the provider;
- pass only `name`, `email`, `password`, the safe `callbackURL`, and `rememberMe: false` to `authClient.signUp.email`;
- never store a password in a URL, cookie, local storage, session storage, toast, debug event, or error report;
- clear password fields after a provider error where appropriate;
- map the disabled-signup provider code to a friendly deployment message;
- map rate limiting to a retry-later message;
- use a generic fallback for provider and network failures;
- on success, show the neutral success toast and navigate to the login URL with `registered=1` and the safe `next` path.

## Routing and Redirect Safety

Modify `apps/web/src/proxy.ts` so both `/login` and `/register` are public auth pages. Keep `/api`, `/images`, Next internals, and static assets excluded as they are today.

Do not trust `next` directly:

- parse it through `getSafeCallbackPath`;
- allow only same-site paths beginning with one `/`;
- reject protocol-relative URLs, absolute URLs, and backslash variants;
- use `URLSearchParams` or an equivalent encoded builder when carrying it between login and register.

An authenticated user visiting `/register` may see the page in the first implementation; redirecting already-authenticated visitors away from public auth pages is optional follow-up work because the proxy performs only an optimistic cookie-presence check today.

## File Plan

Create:

- `apps/web/src/app/(auth)/register/page.tsx`
- `apps/web/src/features/auth/components/register-form.tsx`
- `apps/web/src/features/auth/components/register-form.test.tsx`

Modify:

- `apps/web/src/app/(auth)/layout.tsx`
- `apps/web/src/app/(auth)/login/page.tsx`
- `apps/web/src/features/auth/components/login-form.tsx`
- `apps/web/src/features/auth/components/login-form.test.tsx`
- `apps/web/src/features/auth/index.ts`
- `apps/web/src/lib/auth/redirect.ts` if a small URL-builder helper is useful
- `apps/web/src/lib/auth/redirect.test.ts`
- `apps/web/src/proxy.ts`
- `apps/web/src/proxy.test.ts`
- `apps/web/src/app/routes.test.tsx`
- `apps/web/e2e/unauthenticated.spec.ts`
- `apps/web/e2e/login.spec.ts` only if the post-registration notice affects the live login flow

No generated API schema or client file should change.

## Test Plan

### Component tests

`register-form.test.tsx` should verify:

- valid input calls `authClient.signUp.email` with the trimmed name, email, password, safe callback, and `rememberMe: false`;
- success navigates to login with `registered=1` and the encoded safe return path;
- mismatched passwords show an accessible error and make no provider call;
- too-short and too-long passwords are blocked before submission;
- provider errors restore the form and display a safe message;
- disabled signup gets a deployment-specific message;
- a rejected request gets a retryable network message;
- submit is unavailable before hydration and while a request is pending;
- password visibility controls do not change the submitted value.

Extend `login-form.test.tsx` to verify:

- the post-registration status notice;
- the register link carries only a sanitized internal `next` value;
- existing sign-in behavior remains unchanged.

### Routing tests

Extend `proxy.test.ts` and route smoke tests to verify:

- `/register` is public;
- protected pages still redirect to `/login`;
- `/register?next=...` renders the new page;
- malformed external return paths become `/`;
- login and register links preserve valid internal return paths.

### Browser tests

Extend `unauthenticated.spec.ts` to verify:

- the registration form renders on desktop and mobile projects;
- name, email, password, confirmation, and submit controls are accessible;
- the page has no automatically detectable Axe violations;
- `/register` does not redirect to `/login`.

Do not create real accounts in the standalone browser suite. The backend integration plan owns real registration writes against an isolated Testcontainers database.

## Accessibility and UX Requirements

- Every input has a visible label.
- Errors use `role="alert"` and the post-registration confirmation uses `role="status"`.
- Focus moves to, or is programmatically associated with, the first actionable validation error.
- All controls are keyboard usable and have visible focus styles.
- Pending copy is explicit, for example "Creating account…".
- The form works at the existing mobile and desktop breakpoints without changing the shared visual language.
- Do not use color alone to communicate success or failure.

## Verification

Run the repository definition-of-done gates:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
```

Also run focused frontend checks while iterating:

```bash
pnpm --filter @treasury-ops/web test -- src/features/auth/components/register-form.test.tsx
pnpm --filter @treasury-ops/web test -- src/features/auth/components/login-form.test.tsx
pnpm --filter @treasury-ops/web test -- src/proxy.test.ts
pnpm --filter @treasury-ops/web test:e2e -- e2e/unauthenticated.spec.ts
```

## Frontend Acceptance Criteria

- `/register` is reachable without a session and visually matches `/login`.
- The form validates confirmation and the 8–128 character password range.
- Submission uses `authClient.signUp.email`; no handwritten fetch exists.
- Success goes to login without creating or assuming an authenticated session.
- The UI does not reveal whether an email already existed.
- `next` remains internal and sanitized throughout registration and sign-in.
- Disabled signup and rate limiting produce safe, understandable messages.
- Passwords never enter URLs, storage, logging, or telemetry.
- Unit, route, accessibility, and repository quality gates pass.
