# User Profile Summary UI

> Audit date: 2026-07-16  
> Frontend status: **implemented 2026-07-17**  
> Backend status: **ready for the read-only summary** — transport parsing and OpenAPI/generated-client coverage are complete. Profile editing remains out of scope.

## 0. Outcome and acceptance gate

Show the app-owned user profile—display name, locale, and timezone—on the settings page alongside the existing Better Auth email and sign-out controls.

The acceptance demo is a read-only `/more` profile card that loads the current user's display name, `en-IN` locale, and `Asia/Kolkata` timezone from `/v1/profile`, handles an unavailable profile safely, and does not pretend those fields are editable.

## 1. Verified current state

- `GET /api/v1/profile` exists in `apps/api/src/user-profiles/user-profile.controller.ts`.
- `UserProfileService.get()` returns the current user's profile or a domain not-found error.
- `UserProfileSchema` and `UserProfileUpdateSchema` exist in `packages/shared/src/user-profile.ts`.
- `/more` currently shows only `session.user.email` from Better Auth.
- The profile route is present in OpenAPI and the generated frontend client.
- There is no profile loader, query key, or component.
- Despite the update schema, there is no PATCH/PUT controller. Full profile settings are therefore not backend-ready.

`GET /v1/auth/me` is not part of this gap: the frontend already obtains equivalent session identity from Better Auth.

## 2. Backend contract

| Operation         | Response      | UI scope          |
| ----------------- | ------------- | ----------------- |
| `GET /v1/profile` | `UserProfile` | Read-only summary |

Fields are `userId`, `displayName`, fixed locale `en-IN`, fixed timezone `Asia/Kolkata`, and created/updated timestamps.

Do not display the internal `userId` in the ordinary settings card.

## 3. Completed read-only contract prerequisites

### OpenAPI

`GET /v1/profile`, auth, `UserProfileSchema`, not-found, and problem+json responses are registered and generated.

### HTTP dates

`UserProfileSchema` uses transport-safe coercion for JSON ISO timestamps. Do not cast generated response data in the frontend.

Profile update must remain out of scope until a real authenticated, user-scoped, validated, audited, idempotent update endpoint exists and is generated.

## 4. Proposed files

```text
apps/web/src/features/profile/
├── components/profile-summary.tsx
├── server/get-profile.ts
└── index.ts
apps/web/src/app/(app)/more/page.tsx
```

This summary can remain server-rendered; no client hook/query key is needed unless another interactive consumer appears. If a query is later justified, add `qk.profile()` centrally.

## 5. Data and rendering flow

- `/more` loads the Better Auth session and app profile in parallel.
- `getProfile()` uses the server generated API client, forwards cookies through existing infrastructure, and parses with the corrected `UserProfileSchema`.
- Email remains sourced from Better Auth; display name/locale/timezone come from the profile endpoint. Do not merge them into a hand-written combined DTO.
- A `404` profile is an actionable provisioning problem. Render a concise unavailable state and preserve sign-out/import/settings access rather than failing the entire page.
- Unexpected errors go to the route error boundary according to existing frontend policy.

## 6. UX specification

Render a `Profile` card with:

- Display name.
- Signed-in email.
- Locale shown as `English (India)` with `en-IN` secondary text.
- Timezone shown as `India Standard Time` with `Asia/Kolkata` secondary text.
- No edit affordance.

The creation/update timestamps are not useful as primary settings fields; omit them unless a diagnostic disclosure is intentionally added.

Keep the current import link and sign-out behavior. This feature should not turn `/more` into a new primary navigation surface.

## 7. Loading, errors, privacy, and accessibility

- Because `/more` is server-rendered, use the route/loading boundary if the profile call is slow; do not flash fake values.
- Never log email, display name, session cookie, or full profile payload.
- Labels are visible text, not placeholders.
- The unavailable-profile message should not expose internal ids or raw database errors.
- Locale/timezone codes remain selectable text for troubleshooting.

## 8. Tests

- Shared: ISO timestamps parse at the HTTP boundary.
- Server loader: generated client call, cookie forwarding through existing client, successful schema parse, 401/404/invalid payload behavior.
- Component/route: display name + email sources, human/code labels, unavailable profile without losing other settings actions.
- Contract: OpenAPI includes profile GET and tenancy probe coverage.
- E2E: authenticated user sees their own profile only; cross-user response is impossible.

## 9. Out of scope

- Editing display name, locale, timezone, email, or password.
- Passkey management.
- Avatar upload.
- Replacing Better Auth session handling with `/v1/auth/me`.

## 10. Definition of done

- Profile GET is registered/generated and has a transport-safe schema.
- UI is explicitly read-only.
- Session identity and app profile remain correctly separated.
- No sensitive profile data is logged.
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm test:e2e` passes.
