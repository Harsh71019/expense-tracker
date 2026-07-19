# Accent Color Preferences

> Status: proposed
>
> Scope: frontend-only personalization
>
> Default: the existing Vyaya green accent remains unchanged

## Goal

Allow a user to choose an accent color for interactive and decorative UI while preserving the current Vyaya green as the default. A user can return to that default at any time.

This is a visual preference only. It must not change ledger data, category colors, chart series, or the semantic colors used for income, expense, warnings, errors, and reversals.

## Current behavior

The frontend has a fixed green accent defined in `apps/web/src/app/globals.css`:

| Theme | Accent    | Strong    | Foreground |
| ----- | --------- | --------- | ---------- |
| Light | `#0f9d63` | `#128051` | `#ffffff`  |
| Dark  | `#34d399` | `#2cb382` | `#04140d`  |

Light/dark mode is cookie-backed and resolved in the root server layout before the page renders. Accent selection should follow the same model so the chosen color is present on first paint without a hydration flash.

## User experience

Add an **Appearance** section to the authenticated `/more` page. It should contain:

- A labeled **Accent color** group with a small set of named color swatches.
- A visible selected state using a check mark and border, not color alone.
- Accessible names such as “Vyaya green” and “Ocean blue”; raw hex values are not user-facing labels.
- A **Reset to Vyaya default** action. It should be disabled or omitted while the default is already selected.
- Immediate application after selection. A full navigation refresh caused by the existing server-action pattern is acceptable for the first implementation.

The default option must be named **Vyaya green** and shown first. Selecting it and using the reset action have the same result: remove the accent-preference cookie and let the application fall back to the built-in colors.

## Initial palette

Only curated presets are supported. Arbitrary color input is out of scope because it makes contrast, focus visibility, and dark-mode behavior unpredictable.

| ID        | Label         | Theme | Accent    | Strong    | Foreground | Glow                        |
| --------- | ------------- | ----- | --------- | --------- | ---------- | --------------------------- |
| `default` | Vyaya green   | Light | `#0f9d63` | `#128051` | `#04140d`  | `rgba(15, 157, 99, 0.15)`   |
| `default` | Vyaya green   | Dark  | `#34d399` | `#2cb382` | `#04140d`  | `rgba(52, 211, 153, 0.15)`  |
| `ocean`   | Ocean blue    | Light | `#1d4ed8` | `#1e40af` | `#ffffff`  | `rgba(29, 78, 216, 0.15)`   |
| `ocean`   | Ocean blue    | Dark  | `#60a5fa` | `#3b82f6` | `#071426`  | `rgba(96, 165, 250, 0.15)`  |
| `indigo`  | Ledger indigo | Light | `#4338ca` | `#3730a3` | `#ffffff`  | `rgba(67, 56, 202, 0.15)`   |
| `indigo`  | Ledger indigo | Dark  | `#818cf8` | `#6366f1` | `#0b1028`  | `rgba(129, 140, 248, 0.15)` |
| `violet`  | Mumbai violet | Light | `#7e22ce` | `#6b21a8` | `#ffffff`  | `rgba(126, 34, 206, 0.15)`  |
| `violet`  | Mumbai violet | Dark  | `#c084fc` | `#a855f7` | `#1b0826`  | `rgba(192, 132, 252, 0.15)` |
| `amber`   | Saffron amber | Light | `#b45309` | `#92400e` | `#ffffff`  | `rgba(180, 83, 9, 0.15)`    |
| `amber`   | Saffron amber | Dark  | `#fbbf24` | `#f59e0b` | `#211300`  | `rgba(251, 191, 36, 0.15)`  |

The original Vyaya green accent and strong hues remain unchanged. The default light `accent-foreground` changes from white to `#04140d`: white on `#0f9d63` has only about `3.49:1` contrast, while the dark ink has about `5.42:1`. This corrects an existing accessibility issue without replacing the original default accent color.

Red is intentionally not offered because it is already the expense/error color. Green continues to represent income even when another accent is selected.

## Preference and rendering model

Use a dedicated cookie named `vyaya-accent` containing only a known preset ID. Do not store raw CSS, hex values, or an unchecked user string.

- Cookie attributes: `path=/`, `maxAge=31536000`, `sameSite=lax`.
- Missing, malformed, or unsupported values resolve to `default`.
- Reset deletes the cookie instead of writing `default`, preserving the existing CSS fallback as the source of truth.
- The root layout reads both theme and accent preferences and renders `data-accent` only for a non-default valid selection.
- CSS selectors combine `data-theme` and `data-accent` so every preset has explicit light and dark values.
- System light/dark preference still works when no explicit theme cookie exists.
- The preference is browser-local, matching the current theme behavior. Cross-device account syncing is a separate backend feature and is not part of this work.

Suggested type boundary:

```ts
export const ACCENTS = {
  default: "default",
  ocean: "ocean",
  indigo: "indigo",
  violet: "violet",
  amber: "amber"
} as const;

export type Accent = (typeof ACCENTS)[keyof typeof ACCENTS];
```

Cookie values must be narrowed with an `isAccent()` runtime check before use. This preference does not require an API DTO or a shared-package schema because it never crosses the Next.js frontend boundary.

## Token behavior

Accent selection may update only these design tokens:

- `--color-accent`
- `--color-accent-strong`
- `--color-accent-foreground`
- `--color-accent-glow`

It must not update:

- `--color-income`
- `--color-expense`
- `--color-reversed`
- surface, border, or foreground tokens
- user-defined category colors
- report/chart data colors

This separation requires removing the current accidental coupling between `--color-income` and the accent family. The default accent hues remain identical because both values continue to use the existing green colors; only the light accent foreground changes for accessible contrast as documented above.

## Proposed frontend structure

Keep the implementation small and aligned with the existing theme files:

```text
apps/web/src/
├─ app/globals.css
├─ app/layout.tsx
├─ app/(app)/more/page.tsx
├─ components/ui/accent-picker/
│  ├─ accent-picker.tsx
│  ├─ index.ts
│  └─ __tests__/accent-picker.test.tsx
└─ lib/
   ├─ accent.ts
   ├─ accent-actions.ts
   └─ accent-server.ts
```

The route remains a server component. The picker should use server actions, just like the existing theme toggle, and should not introduce a new client state library or handwritten API call.

## Accessibility requirements

- Text and icons on a solid accent background meet WCAG AA contrast: at least `4.5:1` for normal text and `3:1` for large text.
- Focus indicators and component boundaries meet at least `3:1` contrast against adjacent colors in both themes.
- Each swatch is a real button or radio control with an accessible name and selected state.
- Selection is indicated by text/check mark/border in addition to hue.
- The control is fully keyboard operable and retains a visible focus ring.
- Accent changes must not be the only way any ledger state or money direction is communicated.
- Reduced-motion behavior remains unchanged.

## Error and fallback behavior

- Unknown cookie value: render the default and allow the next selection/reset to repair the cookie.
- Server action failure: keep the previous selection and expose the failure through the form/action error pattern used by the frontend; do not optimistically claim success.
- CSS missing for a new preset: the base green variables remain the safe fallback.
- JavaScript disabled: selection still works through the server-action form submission.

## Tests

### Unit and component tests

- `isAccent()` accepts every supported ID and rejects unknown/empty values.
- Server preference loading returns `null` or `default` for missing and invalid cookies, following the final helper contract.
- Selecting a preset writes the expected cookie attributes.
- Reset deletes the cookie.
- The picker exposes all preset names, marks the current selection, and provides the reset behavior.
- The root layout applies no `data-accent` attribute for the default and the correct attribute for a valid custom preference.
- Existing light/dark theme tests continue to pass for every accent state.

### End-to-end checks

- Choose a non-default accent, navigate to another route, and confirm it persists.
- Reload directly into a route and confirm the selected accent is present on first paint.
- Switch between light and dark mode and confirm both variants of the selected preset apply.
- Reset and confirm the original light and dark Vyaya green colors return.
- Inject an invalid cookie and confirm the app renders safely with the default.
- Run automated accessibility checks for the appearance controls in both themes.

## Implementation sequence

1. Define the accent IDs, labels, runtime guard, cookie constant, and cookie read/write/reset helpers.
2. Add explicit CSS token overrides for every preset in light, dark, and system-theme paths.
3. Read the accent preference in the root layout and emit the validated `data-accent` attribute.
4. Add the accessible picker to `/more` and export it through the UI component barrel.
5. Decouple semantic income color from the selected accent while preserving the current default appearance.
6. Add unit, layout, component, and end-to-end coverage.
7. Run `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration`; include `pnpm test:e2e` because the authenticated `/more` route changes.

## Acceptance criteria

- Vyaya green remains the appearance for users who have never chosen an accent.
- A user can select any supported preset from `/more` and see it applied throughout the frontend.
- The selection persists across navigation and reloads without a first-paint color flash.
- A user can restore the original accent colors with one reset action.
- Light mode, dark mode, and system theme each render a deliberate variant of every preset.
- Income, expense, reversal, error, category, and chart colors retain their existing semantics.
- Invalid preference data always falls back to the original accent safely.
- All supported foreground/background combinations meet the documented contrast requirements.
- No backend endpoint, database field, migration, dependency, or generated API-client change is introduced.

## Non-goals

- Free-form hex, RGB, HSL, or color-picker input.
- User-created palettes or separate accent choices per theme.
- Cross-device/account-synced appearance preferences.
- Changing ledger semantics, category colors, chart palettes, or PWA icons.
- Replacing the existing light/dark theme control.
