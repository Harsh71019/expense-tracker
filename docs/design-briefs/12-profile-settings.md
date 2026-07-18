# Profile & Settings

One-line: user identity summary plus access into every secondary feature (accounts, categories, rules, assets, transfers, export, imports, recurring rules).

## Data model

`UserProfile`:

| Field | Type | Notes |
|---|---|---|
| `userId` | string | |
| `displayName` | string, 1–100 chars | |
| `locale` | literal `"en-IN"` | fixed, not user-selectable — no locale picker needed |
| `timezone` | literal `"Asia/Kolkata"` | fixed, not user-selectable — no timezone picker needed |
| `createdAt` / `updatedAt` | timestamp | |

Email is not part of `UserProfile` — it comes from the auth session separately (`GET /v1/auth/me`, see [13-auth.md](13-auth.md)) and should be shown alongside the profile.

## Business rules that shape the UI

- `displayName` is currently **not editable through any endpoint** — a rename schema exists internally (`UserProfileUpdateSchema`) but isn't wired to a route yet. Don't design a "rename yourself" affordance against the current API; if you need one, flag it as blocked on a backend endpoint rather than assuming `PATCH /v1/profile` exists.

- Locale and timezone are hard-pinned to India — this is a single-market product; don't design locale/timezone switchers.
- This is conceptually a **hub, not a settings form** — mostly a link surface into other full features (accounts, categories, category rules, assets, transfers, export, imports, recurring rules) rather than inline controls.
- Sign-out belongs somewhere in this area.

## API surface

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/profile` | fetch display name + locale + timezone |
