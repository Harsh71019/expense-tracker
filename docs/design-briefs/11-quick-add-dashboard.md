# Home Dashboard & Quick Add

One-line: the app's landing screen (total balance + active accounts) and a fast single-transaction entry form.

## Data model

No dedicated schema — this feature composes existing ones:

- The dashboard reads `Account[]` (see [01-accounts.md](01-accounts.md)) and sums `balanceMinor` across non-archived accounts for a headline balance figure.
- Quick Add posts a `CreateTransaction` (see [02-transactions.md](02-transactions.md)), and may need to create a brand-new `Account` inline if the user has none yet.

## Business rules that shape the UI

- **Zero-accounts is the true empty state that gates the entire app** — the dashboard must branch: no active accounts → onboarding prompt + a single CTA to create one; ≥1 active account → balance summary + account list.
- Any headline balance figure should sum only **active** (non-archived) accounts.
- Quick Add is meant to be fast — mutations should be idempotent per form session (a stable client-generated key across a single submit), since duplicate-submit-safety on flaky mobile connections is a real product requirement here, not just a nice-to-have.
- First-account creation is conceptually part of the "add money" flow, not the accounts-management flow — treat it as onboarding, not settings.

## Data it draws on

Reuses account listing/creation and transaction creation — see [01-accounts.md](01-accounts.md) and [02-transactions.md](02-transactions.md) for the exact API surface.
