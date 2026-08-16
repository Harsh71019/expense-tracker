# Profile: editable display name — backend

## Context

TreasuryOps has a `user-profiles` module, but it is read-only end to end: the only route is `GET /v1/profile`. There is no way for a user to actually change anything about their profile via the API, even though the repository layer already has a working, tested-adjacent `update()` method that nothing calls. This document designs the minimal backend change to close that gap — one `PATCH /v1/profile` endpoint — before any frontend work starts.

This document is a design only; implementation has not started.

## What already exists (do not rebuild)

- **Schema** (`packages/shared/src/user-profile.ts`): `UserProfileSchema` (`userId`, `displayName` 1–100 chars, `locale` — literal `"en-IN"`, `timezone` — literal `"Asia/Kolkata"`, `createdAt`, `updatedAt`) and `UserProfileUpdateSchema = UserProfileSchema.pick({ displayName: true })`. Both already exist and are exported from `packages/shared/src/index.ts` — no shared-package change needed.
- **Table** (`apps/api/src/common/db/schema/user-profile.ts`): `user_profiles` has exactly `user_id` (PK, FK → `user.id`), `display_name`, `locale` (default `en-IN`), `timezone` (default `Asia/Kolkata`), `created_at`, `updated_at`. No migration needed — every column this feature touches already exists.
- **Repository** (`apps/api/src/user-profiles/user-profile.repository.ts`): `findByUserId`, `create`, `ensure` (upsert via `onConflictDoNothing`, called on every authenticated request — see below), and **`update(userId, input)`** — parses `input` through `UserProfileUpdateSchema`, sets `updatedAt`, returns the updated row or `null` if no row matched. This method is fully implemented and already covered by the shape the rest of this design relies on; it is simply never called today.
- **Service** (`apps/api/src/user-profiles/user-profile.service.ts`): exposes `ensure(userId, displayName)` and `get(userId)` (throws `EntityNotFoundError` on a miss). No `update` method — this is the gap.
- **Controller** (`apps/api/src/user-profiles/user-profile.controller.ts`): `@Controller("v1/profile")` with a single `@Get()`. No `@Patch()`.
- **OpenAPI registry** (`apps/api/src/openapi/registry.ts:566-575`): registers only the `get` path for `/v1/profile` (200 → `UserProfile`, 404 → `ProblemDetails`).
- **`ensure()` is called from two places**, both on the hot path of every authenticated request or signup: `AuthGuard.canActivate` (`apps/api/src/auth/auth.guard.ts:75`) and `AuthService`'s `user.create.after` hook (`apps/api/src/auth/auth.service.ts:38`). This means a profile row is guaranteed to exist for any user who can reach a controller — the new `PATCH` handler will never legitimately hit "no such profile."

## Design

### A. `UserProfileService.update(userId, input)`

Add a thin wrapper mirroring `get()`'s existing shape:

```typescript
async update(userId: string, input: unknown): Promise<UserProfile> {
  const profile = await this.profiles.update(userId, input);
  if (profile === null) {
    throw new EntityNotFoundError("User profile");
  }
  return profile;
}
```

`input` stays `unknown` at the service boundary and gets parsed by the repository's existing `UserProfileUpdateSchema.parse(input)` call — matching how `update()` is already written. The controller (below) also parses before calling in, which is redundant validation but matches this codebase's existing convention (e.g. `ApiKeysController.update` parses with `UpdateApiKeySchema.parse(body)` before calling `ApiKeysService.update`, which itself trusts the shape). Keep the double-parse for consistency rather than special-casing profile.

### B. `PATCH /v1/profile`

Add to `UserProfileController`:

```typescript
@Patch()
async update(
  @CurrentUser() user: AuthenticatedUser,
  @Body() body: unknown
): Promise<UserProfile> {
  return this.profiles.update(user.id, UserProfileUpdateSchema.parse(body));
}
```

No `:id`/`:userId` param — same as `GET`, the route is implicitly scoped to the caller via `@CurrentUser()`, never a path/body-supplied id (AGENTS.md §3, root `CLAUDE.md`).

### C. OpenAPI registry entry

Add immediately after the existing `get` registration at `registry.ts:566-575`, mirroring the `PATCH /v1/api-keys/{keyId}` shape (`registry.ts:667-673`):

```typescript
registry.registerPath({
  method: "patch",
  path: "/v1/profile",
  security: secured,
  request: { body: json(UserProfileUpdateSchema) },
  responses: {
    200: { description: "Updated user profile", ...json(UserProfile) },
    404: { description: "Profile not found", ...json(ProblemDetails) },
    ...problemResponses
  }
});
```

`UserProfileUpdateSchema` needs importing into `registry.ts` alongside the existing `UserProfile` import. Run `pnpm gen:client` afterward so `apps/web`'s generated types (`src/lib/api/generated/schema.d.ts`) pick up the new operation — the frontend plan depends on this.

### D. Explicitly out of scope

- **`locale`/`timezone` stay non-editable.** `UserProfileUpdateSchema` only picks `displayName`; `locale`/`timezone` are single-value zod literals, not free strings, matching the hardcoded `Asia/Kolkata` invariant in `AGENTS.md` §4. Nothing in this design opens them up — that would be a separate, deliberate decision (likely a country/timezone-support feature, not a "profile" one).
- **Better Auth's own `user.name`/`user.email` are untouched.** `user_profiles.displayName` is a separate column, seeded once from `user.name` at signup via `ensure()` and never synced back. This design does not call Better Auth's `updateUser` API — `displayName` in `user_profiles` becomes the one editable "name" surface the app shows (`ProfileSummary`, `settings-panel.tsx`'s "Signed in as ..." line), while the Better Auth `user` row (and whatever it's used for — e.g. email delivery, if that's ever added) is a separate, unmodified concern. Worth flagging if a future feature needs the two in sync.
- **No Idempotency-Key handling needed server-side.** `IdempotencyPostgresService` (`apps/api/src/common/idempotency/`) is opt-in per mutation, used where a duplicate network retry could double-create a row (e.g. transactions). A `PATCH` that re-sets the same `displayName` is naturally idempotent — no double-insert risk — so the controller doesn't need to read the header at all. (The frontend plan still sends one, matching its own established per-mutation-hook convention — see the frontend doc — but the backend has nothing to do with it.)
- **No new error codes.** `EntityNotFoundError` (already used by `get()`) covers the theoretical-only 404 case; validation failures fall through zod's `parse()` throw, handled by the existing global exception pipeline the same way every other endpoint's inline `Schema.parse(body)` is.

## Testing

- Unit (`apps/api/src/user-profiles/__tests__/user-profile.controller.test.ts`, extend the existing file): `update` calls `profiles.update` with `(user.id, parsedBody)` and returns its result; a `service.update` rejection propagates (mirrors the existing "preserves the not-found result" test for `get`).
- Unit (new, or extend if a service test file gets added): `UserProfileService.update` throws `EntityNotFoundError` when the repository returns `null`, returns the profile otherwise.
- Repository-level `update()` already has no dedicated test file — check `user-profile.repository.ts` for an existing `__tests__` dir before adding one; if none exists, this is a good moment to add one at the integration level (`apps/api/test/integration/`) since it's a real DB round-trip (update + `updatedAt` bump), consistent with how other repositories in this codebase are tested against real Postgres via testcontainers rather than mocked.
- Definition of done: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm gen:client` before `pnpm build` (AGENTS.md §7). `pnpm verify:migrations` is a no-op here since no migration is added, but run it anyway to match the standard gate.

## Suggested implementation order

1. `UserProfileService.update` + its unit test.
2. `PATCH /v1/profile` on the controller + its unit test.
3. OpenAPI registry entry + `pnpm gen:client` (unblocks the frontend plan).
4. Integration test for the repository's `update()` round-trip, if not already covered.
