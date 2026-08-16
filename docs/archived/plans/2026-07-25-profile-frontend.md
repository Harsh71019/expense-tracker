# Profile: editable display name — frontend

## Context

Depends on `docs/plans/2026-07-25-profile-backend.md` (`PATCH /v1/profile`) — do not start this until that ships and `pnpm gen:client` has run, since the generated client's `PATCH "/v1/profile"` operation doesn't exist until then.

Today the `profile` feature is read-only display, wired into one place: the "Profile" tab of `/settings` (the default tab). There is no edit affordance anywhere in the app for a user's display name.

This document is a design only; implementation has not started.

## What already exists (do not rebuild)

- **Server fetcher** (`apps/web/src/features/profile/server/get-profile.ts`): `getProfile()`, wrapped in React's `cache()`, calls `GET /v1/profile` via the server API client, validates with `UserProfileSchema.safeParse`, returns `UserProfile | null` (never throws — a fetch/parse failure degrades to `null`, and `ProfileSummary` already renders a "Profile unavailable" state for that case).
- **Display component** (`apps/web/src/features/profile/components/profile-summary.tsx`): pure presentational, no hooks, no `"use client"` — takes `profile` and `email` as props, renders an initials avatar + name + locale/timezone caption. Not editable.
- **Barrel** (`apps/web/src/features/profile/index.ts`): exports only `{ ProfileSummary }`. **`getProfile` is deliberately not re-exported here** — `settings-panel.tsx` imports it directly from `./server/get-profile`. This split matters and must be preserved (see "RSC barrel boundary" below).
- **Wiring** (`apps/web/src/app/(app)/settings/settings-panel.tsx`'s `ProfileSettingsPanel`, an `async` Server Component): fetches `getSession()` + `getProfile()` in parallel, renders `<ProfileSummary profile={profile} email={email} />` followed by a static "Signed in as ... / Sign out" card. No client component exists in this subtree today.
- **No query-hook layer exists for profile at all** — no `qk.profile()` entry in `apps/web/src/lib/query/keys.ts`, no `apps/web/src/features/profile/hooks/` directory, no TanStack Query usage anywhere in this feature. Every other feature that needs client-side interactivity (categories, accounts, api-keys, ...) has this layer; profile currently doesn't need it because there's nothing to mutate.

## Design

### A. `qk.profile()` query key

Add to `apps/web/src/lib/query/keys.ts`:

```typescript
profile: () => ["profile"] as const,
```

### B. `apps/web/src/features/profile/hooks/use-profile.ts` (new, `"use client"`)

Two exports, following the exact shape of `apps/web/src/features/categories/hooks/use-category-mutations.ts`:

- **`useProfile(initialProfile: UserProfile | null)`** — a `useQuery` over `qk.profile()`, calling `apiClient.GET("/v1/profile")` through the browser client (`src/lib/api/client.ts`), validated with `UserProfileSchema.safeParse` (fail closed → same "unavailable" semantics as the server fetcher, per `AGENTS.md` §6). Seeded with `initialData: initialProfile` so the settings page doesn't show a loading flash on first paint — mirrors how `useTxnList` takes `initialPage` per the architecture doc.
- **`useUpdateProfile()`** — a `useMutation` wrapping `apiClient.PATCH("/v1/profile", { body: { displayName }, params: { header: { "Idempotency-Key": key } } })`, with the same `generateRequestId()`-backed key rotation `useCreateCategory`/`useArchiveCategory` use. Response parsed with `UserProfileSchema.safeParse`; a parse failure throws `toAppError(undefined, result.response.status)`, matching `useCreateCategory`. `onSettled` invalidates `qk.profile()`. No toast inside the hook — per `apps/web/CLAUDE.md`'s convention, that stays at the call site.

The backend has no idempotency check for this route (see the backend doc's "explicitly out of scope" section — a `PATCH` re-setting the same value is naturally idempotent), but the header is sent anyway to match this codebase's established per-mutation-hook convention rather than special-casing profile as the one mutation without it.

### C. `apps/web/src/features/profile/components/edit-display-name-form.tsx` (new, `"use client"`)

A small, self-contained form — **not** a rework of `ProfileSummary`, which stays a pure display component. Follows the `create-category-sheet.tsx` pattern: local `useState` for the input value, `UserProfileUpdateSchema.safeParse` for client-side validation before submit, `mutateAsync`, `toast.success("Profile updated")` / `toast.error("Could not update profile")` on the two outcomes, inline field error from a thrown `ValidationError`'s `.fields` matching `create-category-sheet.tsx`'s `fieldErrorName` pattern (trivial here — there's exactly one field).

Props: `Readonly<{ initialProfile: UserProfile | null }>`. Renders nothing (or a disabled state) if `initialProfile === null` — matches `ProfileSummary`'s existing "profile unavailable" handling rather than inventing new error UI for a case that's already handled one component over.

### D. Wiring change in `settings-panel.tsx`

`ProfileSettingsPanel` (still an `async` Server Component) renders, after `<ProfileSummary .../>`:

```tsx
<EditDisplayNameForm initialProfile={profile} />
```

`EditDisplayNameForm` is a client island inside the server-rendered panel — same pattern already used for `ThemePreferenceForm`/`AccentPicker` inside `AppearanceSettingsPanel` (also server components hosting client islands, same file).

### E. Barrel export — RSC boundary

Export `EditDisplayNameForm` from `apps/web/src/features/profile/index.ts` (it's client-safe). **Do not** add `getProfile` to that barrel while doing this — a past incident in this codebase: a client component importing a feature barrel that also exports a server-only fetcher breaks `next build`. `settings-panel.tsx` already imports `getProfile` directly from `./server/get-profile`, bypassing the barrel; keep it that way. `useProfile`/`useUpdateProfile` (client hooks) are fine to export from either the barrel or a direct `hooks/use-profile` import — match whatever the sibling features (e.g. `categories`) already do for their hooks, for consistency, rather than deciding fresh here.

### F. What this does *not* change

- No new route — profile editing stays inside `/settings` (the "Profile" tab), not a dedicated `/profile` page. Nothing about the current navigation/tab structure changes.
- No avatar upload, no email change, no locale/timezone picker — the backend only exposes `displayName` as editable (see the backend doc's "explicitly out of scope"), so there's nothing for the frontend to build UI for beyond that one field.
- `ProfileSummary`'s initials-from-name logic is untouched; once the mutation invalidates `qk.profile()`, the next render picks up the new `displayName` automatically if `ProfileSummary` itself is ever migrated to read from `useProfile()` instead of the server-rendered prop — out of scope for this pass, since `ProfileSummary` is server-rendered per-request today and a page navigation (e.g. re-visiting `/settings`) already reflects the change without needing this.

## Testing

- `edit-display-name-form.test.tsx`: renders with a seeded profile, submits a new name, asserts `mutateAsync` called with the right body, asserts `toast.success` on success and `toast.error` on failure, asserts inline validation blocks submit on an empty/too-long name without calling the mutation (mirrors `create-category-sheet.test.tsx`'s structure).
- `use-profile.test.tsx`: mirrors `use-api-keys.test.tsx` — mock `apiClient`, assert `useProfile` seeds from `initialData`, assert `useUpdateProfile` sends the `Idempotency-Key` header and invalidates `qk.profile()` on settle.
- Extend `apps/web/src/app/routes.test.tsx` / the settings smoke tests only if the new component changes what's asserted there (a new field type existing shouldn't need new assertions in the route-level smoke test, just confirm nothing there breaks).
- Definition of done: `pnpm --filter @treasury-ops/web lint && pnpm --filter @treasury-ops/web typecheck && pnpm --filter @treasury-ops/web test`. Manually verify in a browser: edit the name, confirm the toast, confirm `ProfileSummary` shows the new name after a refresh (RSC re-fetch), confirm an empty name is blocked client-side before any network call.

## Suggested implementation order

1. `qk.profile()` key.
2. `use-profile.ts` (both hooks) + its test.
3. `EditDisplayNameForm` + its test.
4. Wire into `settings-panel.tsx`, barrel export, manual browser check.
