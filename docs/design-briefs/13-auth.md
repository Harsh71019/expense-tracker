# Auth (Login)

One-line: sign-in for a single-user/home-lab deployment — no self-serve signup, marketing, or pricing framing needed.

## Data model

No product-level schema — credentials/session are handled by the auth provider directly. Nothing to model as fields here; this brief is about flow, not data.

## Business rules that shape the UI

- Session is provider-managed — the login screen's only job is collecting credentials and handing off; no custom cookie/JWT UI logic to design around.
- Authenticated screens live behind a shared app shell/nav; login is a standalone, nav-free screen, not a variant of the app chrome.
- This is a personal/home-lab deployment (single or very few users) — a plain, fast credential form is the right register; no "sign up free," no social proof, no pricing.

## API surface

Handled by the auth provider's own routes, separate from the product's `/v1/*` API — nothing product-specific to enumerate.
