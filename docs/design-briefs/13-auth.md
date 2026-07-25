# Auth (Login and Registration)

One-line: deployment-controlled email/password registration and sign-in for a single-user/home-lab deployment, without marketing or pricing framing.

## Data model

No product-level schema — credentials/session are handled by the auth provider (Better Auth, email+password) directly. Nothing to model as fields here; this brief is about flow, not data.

## Business rules that shape the UI

- Session and credentials are provider-managed — the auth screens collect credentials and hand off to Better Auth; no custom cookie or JWT logic belongs in the UI.
- Authenticated screens live behind a shared app shell/nav; login and registration share a standalone, nav-free auth shell.
- This is a personal/home-lab deployment (single or very few users) — use plain credential forms, not "sign up free," social proof, or pricing copy.
- Registration is available only while `DISABLE_SIGNUP=false`. The deployment owner can set the flag to `true` after bootstrap without changing the frontend or database.
- Registration accepts an 8–128 character password. Better Auth hashes it and atomically creates the auth user and credential account.
- Registration does not create a session. New and existing-email attempts receive the same outward success posture, then the user signs in normally. This avoids exposing whether an email is already registered.
- Sign-in and registration each have a Redis-backed limit of 10 attempts per 60 seconds.
- Once signed in, `GET /v1/auth/me` returns the current session's user (id, email, etc.) — useful anywhere the app needs to display "who's logged in" outside the profile page itself.

## API surface

Better Auth's own routes are mounted at `/api/auth/*` (separate from the product's `/v1/*` API) — registration, sign-in, sign-out, and session refresh all go through there, not through hand-rolled endpoints.

| Method | Path                      | Purpose                                                |
| ------ | ------------------------- | ------------------------------------------------------ |
| `POST` | `/api/auth/sign-up/email` | deployment-controlled email/password registration      |
| `POST` | `/api/auth/sign-in/email` | email/password sign-in and provider-managed session    |
| `GET`  | `/v1/auth/me`             | current session's user for authenticated product views |
