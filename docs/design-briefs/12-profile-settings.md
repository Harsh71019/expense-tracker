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

Email is not part of `UserProfile` — it comes from the auth session separately and should be shown alongside the profile.

## Business rules that shape the UI

- Locale and timezone are hard-pinned to India — this is a single-market product; don't design locale/timezone switchers.
- This is conceptually a **hub, not a settings form** — mostly a link surface into other full features (accounts, categories, category rules, assets, transfers, export, imports, recurring rules) rather than inline controls.
- Sign-out belongs somewhere in this area.

## API surface

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/profile` | fetch display name + locale + timezone |
