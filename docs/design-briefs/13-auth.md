# Auth (Login)

One-line: sign-in for a single-user/home-lab deployment — no self-serve signup, marketing, or pricing framing needed in the UI.

## Data model

No product-level schema — credentials/session are handled by the auth provider (Better Auth, email+password) directly. Nothing to model as fields here; this brief is about flow, not data.

## Business rules that shape the UI

- Session is provider-managed — the login screen's only job is collecting credentials and handing off; no custom cookie/JWT UI logic to design around.
- Authenticated screens live behind a shared app shell/nav; login is a standalone, nav-free screen, not a variant of the app chrome.
- This is a personal/home-lab deployment (single or very few users) — a plain, fast credential form is the right register; no "sign up free," no social proof, no pricing.
- **"No self-serve signup" is a UI decision, not a hard backend limitation** — the auth provider supports email+password sign-up out of the box, gated by a `DISABLE_SIGNUP` deployment flag that defaults to *allowing* sign-up. The shipped web app simply doesn't render a sign-up screen. Design login-only per the product's actual posture, but don't assume the field is technically unavailable — if the deployment story changes, sign-up is a flag flip away, not a new backend feature.
- Once signed in, `GET /v1/auth/me` returns the current session's user (id, email, etc.) — useful anywhere the app needs to display "who's logged in" outside the profile page itself.

## API surface

Better Auth's own routes are mounted at `/api/auth/*` (separate from the product's `/v1/*` API) — sign-in, sign-out, and session refresh all go through there, not through a hand-rolled endpoint. The one product-side addition is:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/auth/me` | current session's user, for authenticated product screens |
