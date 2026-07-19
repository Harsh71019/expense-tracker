# Accent Color Preferences

> Status: implemented 2026-07-19
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
- Accessible preset names such as “Vyaya green” and “Ocean blue”.
- A **Custom color** option with a native color picker and a text field that accepts hex, RGB, or HSL input.
- A preview that shows the normalized color and its light/dark variants before it is applied.
- An inline validation or contrast message when the submitted value cannot be used safely.
- A **Reset to Vyaya default** action. It should be disabled or omitted while the default is already selected.
- A single action button for presets and custom colors. It reads **Apply color** after a selection changes, **Applying…** during the server action, and **Applied** once the active preference matches the staged selection.

The default option must be named **Vyaya green** and shown first. Selecting it and pressing **Apply color**, or using the reset action, have the same result: remove the accent-preference cookie and let the application fall back to the built-in colors. Changing a preset, text value, or native picker after a successful submission returns the button from **Applied** to **Apply color**.

## Preset palette

Curated presets provide fast, reviewed choices. Custom input supplements these presets; it does not replace them.

| ID        | Label         | Theme | Accent    | Strong    | Foreground | Glow                        |
| --------- | ------------- | ----- | --------- | --------- | ---------- | --------------------------- |
| `default` | Vyaya green   | Light | `#0f9d63` | `#10a367` | `#04140d`  | `rgba(15, 157, 99, 0.15)`   |
| `default` | Vyaya green   | Dark  | `#34d399` | `#2cb382` | `#04140d`  | `rgba(52, 211, 153, 0.15)`  |
| `ocean`   | Ocean blue    | Light | `#1d4ed8` | `#1e40af` | `#ffffff`  | `rgba(29, 78, 216, 0.15)`   |
| `ocean`   | Ocean blue    | Dark  | `#60a5fa` | `#3b82f6` | `#071426`  | `rgba(96, 165, 250, 0.15)`  |
| `indigo`  | Ledger indigo | Light | `#4338ca` | `#3730a3` | `#ffffff`  | `rgba(67, 56, 202, 0.15)`   |
| `indigo`  | Ledger indigo | Dark  | `#818cf8` | `#6d70f3` | `#0b1028`  | `rgba(129, 140, 248, 0.15)` |
| `violet`  | Mumbai violet | Light | `#7e22ce` | `#6b21a8` | `#ffffff`  | `rgba(126, 34, 206, 0.15)`  |
| `violet`  | Mumbai violet | Dark  | `#c084fc` | `#a855f7` | `#1b0826`  | `rgba(192, 132, 252, 0.15)` |
| `amber`   | Saffron amber | Light | `#b45309` | `#92400e` | `#ffffff`  | `rgba(180, 83, 9, 0.15)`    |
| `amber`   | Saffron amber | Dark  | `#fbbf24` | `#f59e0b` | `#211300`  | `rgba(251, 191, 36, 0.15)`  |

The original Vyaya green accent hues remain unchanged. The default light `accent-foreground` changes from white to `#04140d`: white on `#0f9d63` has only about `3.49:1` contrast, while the dark ink has about `5.42:1`. The light hover value moves within the same green hue from `#128051` to `#10a367` so it also remains readable with the dark foreground. These adjustments correct an existing accessibility issue without replacing the original default accent color.

Red is intentionally not offered because it is already the expense/error color. Green continues to represent income even when another accent is selected.

## Custom color input

The custom option supports these input forms:

- Native `<input type="color">`, which submits `#rrggbb`.
- Hex text: `#rgb` or `#rrggbb`.
- RGB text: `rgb(r, g, b)` with integer channels from `0` through `255`.
- HSL text: `hsl(h, s%, l%)`, with hue normalized into `0` through `359` and saturation/lightness from `0%` through `100%`.

Input is parsed by owned, pure utilities and normalized to lowercase `#rrggbb` before persistence. Do not add a color library for this small grammar. Alpha values, eight/four-digit hex, CSS color names, `var()`, `url()`, gradients, and arbitrary CSS expressions are rejected.

The user chooses one base color. The application deterministically derives theme-safe tokens from it:

1. Convert the normalized RGB color to HSL.
2. Preserve hue and saturation where possible, but adjust lightness until the accent has at least `3:1` contrast against the theme surface.
3. Select either `#ffffff` or `#04140d` as `accent-foreground`, requiring at least `4.5:1` contrast.
4. Derive `accent-strong` by moving lightness farther from the active theme surface; it must pass the same text and boundary checks.
5. Derive `accent-glow` from the final theme accent at `0.15` alpha.
6. Produce and preview separate light and dark token sets from the same saved base color.

If a requested value needs adjustment, the UI should say that Vyaya tuned it for readable contrast and show the applied result. If the algorithm cannot produce a compliant result, reject the submission and keep the previous accent. The conversion and adjustment functions must be deterministic, side-effect-free, and covered with boundary tests.

A custom red is allowed because the user explicitly requested a free-form color, but the UI should warn that it may resemble expense/error states. Ledger direction and errors must continue to use labels, signs, icons, and other non-color indicators.

## Preference and rendering model

Use a dedicated cookie named `vyaya-accent` containing a validated preset or normalized custom value:

- Preset: `preset:ocean`.
- Custom: `custom:1d4ed8` (canonical six-digit hex without `#`).
- Default: no cookie.

- Cookie attributes: `path=/`, `maxAge=31536000`, `sameSite=lax`.
- Missing, malformed, or unsupported values resolve to `default`.
- Reset deletes the cookie instead of writing `default`, preserving the existing CSS fallback as the source of truth.
- The root layout reads both theme and accent preferences before rendering.
- A preset renders its known `data-accent` value; CSS selectors combine `data-theme` and `data-accent` so every preset has explicit light and dark values.
- A custom value is parsed again on the server and converted into separate light and dark token sets. The root receives `data-accent="custom"` plus typed, namespaced properties such as `--custom-accent-light` and `--custom-accent-dark`; never interpolate the original cookie or form string into HTML or CSS.
- `globals.css` maps the light or dark custom-property set onto the four effective accent tokens using the existing system media query and explicit `data-theme` overrides. This preserves system-theme behavior before hydration.
- System light/dark preference still works when no explicit theme cookie exists.
- The preference is browser-local, matching the current theme behavior. Cross-device account syncing is a separate backend feature and is not part of this work.

Suggested type boundary:

```ts
export const ACCENT_PRESETS = {
  default: "default",
  ocean: "ocean",
  indigo: "indigo",
  violet: "violet",
  amber: "amber"
} as const;

export type AccentPreset = (typeof ACCENT_PRESETS)[keyof typeof ACCENT_PRESETS];

export type AccentPreference =
  | { kind: "default" }
  | { kind: "preset"; preset: Exclude<AccentPreset, "default"> }
  | { kind: "custom"; color: `#${string}` };
```

The template-literal type does not validate a color by itself. Form and cookie values remain `unknown` until the strict parser returns an `AccentPreference`; no cast may substitute for that runtime check. A typed interface extending React's `CSSProperties` should model the eight namespaced light/dark custom properties without an assertion. This preference does not require an API DTO or a shared-package schema because it never crosses the Next.js frontend boundary.

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
│  ├─ accent-preference-form.tsx
│  ├─ index.ts
│  └─ __tests__/accent-picker.test.tsx
└─ lib/
   ├─ accent.ts
   ├─ accent-color.ts
   ├─ accent-color.test.ts
   ├─ accent-actions.ts
   └─ accent-server.ts
```

The route remains a server component. The form should use server actions, just like the existing theme toggle. A small client leaf may synchronize the native picker, text field, and preview, but the server action is authoritative and repeats all parsing and validation. Do not introduce a new state library, dependency, or handwritten API call. Without JavaScript, the text field and submit action must still work; only live preview is enhanced.

## Accessibility requirements

- Text and icons on a solid accent background meet WCAG AA contrast: at least `4.5:1` for normal text and `3:1` for large text.
- Focus indicators and component boundaries meet at least `3:1` contrast against adjacent colors in both themes.
- Each swatch is a real button or radio control with an accessible name and selected state.
- The native picker has a persistent text label; the normalized text value is available to screen readers.
- Parsing and contrast errors are associated with the custom input and announced through an `aria-live="polite"` region.
- Selection is indicated by text/check mark/border in addition to hue.
- The control is fully keyboard operable and retains a visible focus ring.
- Accent changes must not be the only way any ledger state or money direction is communicated.
- Reduced-motion behavior remains unchanged.

## Error and fallback behavior

- Unknown cookie value: render the default and allow the next selection/reset to repair the cookie.
- Malformed, out-of-range, alpha-bearing, or CSS-like custom input: reject it with a field-specific validation message and retain the current preference.
- Valid custom input that needs contrast adjustment: show the adjusted preview and persist the original normalized base so both theme variants can be re-derived from one source.
- Server action failure: keep the previous selection and expose the failure through the form/action error pattern used by the frontend; do not optimistically claim success.
- CSS missing for a new preset: the base green variables remain the safe fallback.
- Custom token generation failure: omit the custom properties and fall back to the original Vyaya green.
- JavaScript disabled: selection still works through the server-action form submission.

## Tests

### Unit and component tests

- The preset guard accepts every supported ID and rejects unknown/empty values.
- Hex, RGB, and HSL parsers accept the documented grammar, normalize equivalent values to the same lowercase six-digit hex, and reject alpha, non-finite, out-of-range, and CSS-expression input.
- RGB/HSL conversion covers hue wraparound, achromatic colors, channel boundaries, and round-trip rounding.
- Custom token derivation is deterministic and meets the surface, foreground, and strong-state contrast thresholds in both themes, including black, white, and mid-luminance inputs.
- Cookie serialization and parsing round-trip every preset and valid custom value without trusting unchecked text.
- Server preference loading returns `null` or `default` for missing and invalid cookies, following the final helper contract.
- Selecting a preset or custom color writes the expected normalized cookie and attributes.
- Reset deletes the cookie.
- The picker exposes all preset names and custom controls, marks the current selection, reports validation, and provides the reset behavior.
- The root layout applies no override for the default, the correct `data-accent` for a preset, and only validated derived custom properties for a custom preference.
- Existing light/dark theme tests continue to pass for every accent state.

### End-to-end checks

- Choose a non-default accent, navigate to another route, and confirm it persists.
- Submit equivalent custom colors as hex, RGB, HSL, and through the native picker; confirm each resolves to the same saved color.
- Enter malformed and injection-shaped values and confirm they are rejected without changing the current accent.
- Choose very light, dark, and mid-luminance custom colors and confirm the preview and applied variants meet contrast requirements.
- Reload directly into a route and confirm the selected accent is present on first paint.
- Switch between light and dark mode and confirm both variants of the selected preset or custom color apply.
- Reset and confirm the original light and dark Vyaya green colors return.
- Inject an invalid cookie and confirm the app renders safely with the default.
- Run automated accessibility checks for the appearance controls in both themes.

## Implementation sequence

1. Define the preset IDs, discriminated preference type, strict color parsers, normalization, contrast utilities, cookie constant, and cookie read/write/reset helpers.
2. Test hex/RGB/HSL boundary handling and deterministic light/dark custom-token generation before wiring UI.
3. Add explicit CSS token overrides for every preset in light, dark, and system-theme paths.
4. Read the accent preference in the root layout and emit either the validated preset attribute or typed, derived custom properties.
5. Add the accessible preset and custom picker to `/more`, including native picker, text input, previews, validation, and reset; export it through the UI component barrel.
6. Decouple semantic income color from the selected accent while preserving the current default appearance.
7. Add layout, component, security-fallback, accessibility, and end-to-end coverage.
8. Run `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration`; include `pnpm test:e2e` because the authenticated `/more` route changes.

## Acceptance criteria

- Vyaya green remains the appearance for users who have never chosen an accent.
- A user can select a preset or provide a custom accent through a native picker, hex, RGB, or HSL input on `/more`, press one **Apply color** action, and see it applied throughout the frontend.
- The action reports **Applied** after success and returns to **Apply color** as soon as the staged selection changes.
- Equivalent color formats normalize to the same saved six-digit hex value.
- Custom input always produces contrast-compliant, deterministic light and dark variants or is rejected without changing the current preference.
- The selection persists across navigation and reloads without a first-paint color flash.
- A user can restore the original accent colors with one reset action.
- Light mode, dark mode, and system theme each render a deliberate variant of every preset and custom color.
- Income, expense, reversal, error, category, and chart colors retain their existing semantics.
- Invalid preference or custom color data always falls back to the original accent safely and cannot inject CSS or markup.
- All supported foreground/background combinations meet the documented contrast requirements.
- No backend endpoint, database field, migration, dependency, or generated API-client change is introduced.

## Non-goals

- Saving multiple named custom palettes or separate custom choices per theme.
- Cross-device/account-synced appearance preferences.
- Changing ledger semantics, category colors, chart palettes, or PWA icons.
- Replacing the existing light/dark theme control.
