# Profile & Settings

One-line: user identity summary, appearance preferences, sign-out, and access into every secondary feature (accounts, categories, rules, assets, transfers, export, imports, recurring rules).

## Route and information architecture

Treat this as the canonical **Settings** hub at `/settings`, replacing the current `/more` presentation rather than adding another competing destination. Navigation should use the human-readable label **Settings**, not expose both “More” and “Settings”. Preserve `/more` as a redirect to `/settings` for existing links and bookmarks.

This page combines three kinds of content:

1. A compact, read-only identity summary.
2. Small preferences that can be changed safely in place, currently theme and accent color.
3. Links to full management workflows such as accounts, categories, imports, transfers, assets, rules, and export.

Do not pull those full workflows into this page. The hub should make them easy to discover without becoming one long settings form.

## Data model

`UserProfile`:

| Field                     | Type                     | Notes                                                  |
| ------------------------- | ------------------------ | ------------------------------------------------------ |
| `userId`                  | string                   |                                                        |
| `displayName`             | string, 1–100 chars      |                                                        |
| `locale`                  | literal `"en-IN"`        | fixed, not user-selectable — no locale picker needed   |
| `timezone`                | literal `"Asia/Kolkata"` | fixed, not user-selectable — no timezone picker needed |
| `createdAt` / `updatedAt` | timestamp                |                                                        |

Email is not part of `UserProfile` — it comes from the auth session separately (`GET /v1/auth/me`, see [13-auth.md](13-auth.md)) and should be shown alongside the profile.

The accent preference is not part of `UserProfile`. It is a frontend-only, browser-local appearance preference stored in a validated cookie. It does not require a profile API field or backend update endpoint.

## Business rules that shape the UI

- `displayName` is currently **not editable through any endpoint** — a rename schema exists internally (`UserProfileUpdateSchema`) but isn't wired to a route yet. Don't design a "rename yourself" affordance against the current API; if you need one, flag it as blocked on a backend endpoint rather than assuming `PATCH /v1/profile` exists.

- Locale and timezone are hard-pinned to India — this is a single-market product; don't design locale/timezone switchers.
- This is conceptually a **hub, not a settings form** — mostly a link surface into other full features (accounts, categories, category rules, assets, transfers, export, imports, recurring rules) with a small inline Appearance section.
- Sign-out belongs somewhere in this area.

## Suggested page hierarchy

1. **Profile summary** — avatar/initials, display name, and email. Locale and timezone may be shown as quiet supporting information but are not controls.
2. **Appearance** — existing light/dark/system theme control and accent-color preference. These should read as one coherent personalization section.
3. **Manage TreasuryOps** — grouped links into accounts, categories, automatic category rules, recurring rules, assets, transfers, imports, and export.
4. **Account actions** — sign-out, visually separated from routine navigation. Sign-out must be clear but should not compete with the primary page content.

On wide screens the identity summary and Appearance section may use separate cards or columns. On mobile, keep a simple single-column order and ensure every interactive target is at least 44px high. Avoid a dense desktop settings table.

## Accent color feature

Accent color belongs inside **Appearance** on this page. It changes interactive and decorative interface color throughout the frontend while leaving financial and status meaning untouched.

### Available choices

Show the built-in choices as named swatches. The selected state must use a check mark and border in addition to color.

| ID        | User-facing label | Preview color |
| --------- | ----------------- | ------------- |
| `default` | TreasuryOps green       | `#0f9d63`     |
| `ocean`   | Ocean blue        | `#1d4ed8`     |
| `indigo`  | Ledger indigo     | `#4338ca`     |
| `violet`  | Mumbai violet     | `#7e22ce`     |
| `amber`   | Saffron amber     | `#b45309`     |

**TreasuryOps green** is the first option and remains the default for new users or browsers without a saved preference. Each preset has deliberately tuned light- and dark-theme variants; the preview should communicate that the chosen accent works in both themes.

Also provide one **Custom color** area with:

- A native color-picker input.
- A free-form text input accepting `#rgb`, `#rrggbb`, `rgb(r, g, b)`, or `hsl(h, s%, l%)`.
- Example helper text, such as `#1d4ed8`, `rgb(29, 78, 216)`, and `hsl(224, 76%, 48%)`.
- Side-by-side light and dark previews using the actual contrast-adjusted result.
- Inline validation and contrast guidance. Invalid input must not replace the currently applied accent.

Alpha colors, CSS color names, gradients, CSS variables, and arbitrary CSS expressions are not supported. Valid custom input is normalized to lowercase six-digit hex before it is saved. If TreasuryOps adjusts lightness to maintain readable contrast, explain that beside the preview rather than silently changing the result.

### Interaction contract

Preset swatches, the text input, and the native picker all stage a choice. They do not compete with one another and do not require separate submit buttons.

- Selecting a preset populates the staged selection and preview.
- Focusing or editing the custom input, or using the native picker, changes the staged selection to Custom.
- The single primary action reads **Apply color** whenever the staged choice differs from the active preference.
- While the preference is being saved, it reads **Applying…** and is disabled.
- After a successful apply, it reads **Applied** and remains disabled while the staged and active choices match.
- Choosing another swatch, typing a different value, or moving the native picker changes the button back to **Apply color**.
- Applying **TreasuryOps green** removes the saved override and restores the original built-in accent.
- A secondary **Reset to TreasuryOps default** action performs the same restoration and is disabled or omitted while the default is active.
- Applying an invalid custom value shows a field-specific error and retains the previous active preference.

Do not optimistically label the choice **Applied** before persistence succeeds. The current implementation is server-authoritative and persists the preference before reporting success.

### Scope and visual guardrails

The accent may affect CTAs, active navigation, focus rings, selected controls, links, decorative glows, and other components using the semantic accent tokens. It must not recolor:

- income or expense amounts;
- errors, warnings, reversals, or status indicators;
- user-defined category colors;
- report or chart data series;
- surfaces, borders, or normal foreground text.

Income stays green and expense/error stays red regardless of the selected accent. A custom red is allowed, but the UI warns that it may resemble expense or error colors; ledger signs, labels, and icons remain the source of meaning.

All solid accent/foreground combinations must meet WCAG AA contrast. Swatches need accessible names, keyboard operation, visible focus rings, and `aria-pressed` or equivalent selected semantics. Validation and apply status should be announced through a polite live region.

### Persistence and rendering constraints

- Preference cookie: `treasury-ops-accent`.
- Preset value example: `preset:ocean`.
- Custom value example: `custom:1d4ed8`.
- Default: no accent cookie.
- Cookie scope: `path=/`, one-year lifetime, `sameSite=lax`.
- The root layout validates and resolves the preference before first paint, so navigation and reloads must not flash back to green.
- The preference is browser-local and does not sync across devices or accounts.
- Malformed or unsupported cookie values fall back safely to TreasuryOps green.

This feature needs no REST request, generated API-client call, database field, or migration. Account-synced appearance would be a separate future backend feature.

## API surface

| Method | Path          | Purpose                                |
| ------ | ------------- | -------------------------------------- |
| `GET`  | `/v1/profile` | fetch display name + locale + timezone |

The accent preference intentionally does not appear in this API table because it is handled within the Next.js frontend through the validated cookie and server action.
