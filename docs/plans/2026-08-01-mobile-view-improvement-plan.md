# TreasuryOps Mobile View Improvement Plan

- **Status:** Approved — Phase 1 foundation and Phase 2 ledger slice in progress
- **Planning branch:** `codex/mobile-view-improvement-plan`
- **Prepared:** 1 August 2026
- **Primary scope:** `apps/web`

## 1. Goal

Make TreasuryOps comfortable and safe to use one-handed on a phone without changing ledger behavior, API contracts, or money rules. The mobile experience should feel like a purpose-built expense ledger, not a desktop dashboard squeezed into 390 px.

The product north star remains the existing brief: capture an expense in under 5 seconds on an unreliable connection while moving through a Mumbai commute. The proposed signature is a persistent **one-thumb ledger rail**: Home, Transactions, Add, Reports, and More in a safe-area-aware bottom bar, with every secondary destination available from More or the full menu.

This plan intentionally preserves the current TreasuryOps visual language—dark/light surfaces, accent preferences, tabular money, compact ledger labels—and spends the visual change on navigation and mobile information hierarchy rather than a broad rebrand.

## 2. Audit Basis

The plan was produced from:

- A folder-by-folder source audit of `apps/web/src/app`, `components`, `features`, `lib`, `mocks`, and the web test folders.
- A rendered review at a 390 × 844 phone viewport using the local mock API.
- The current Web Interface Guidelines covering accessibility, focus, forms, touch, safe areas, responsive content, motion, and performance.
- Existing project intent in `docs/frontend/FRONTEND.md`, especially the mobile bottom navigation, ≥44 px touch targets, and safe-area requirements.

### Baseline findings

| Priority | Finding                                                                                               | Current evidence                                                                                                                                                           |
| -------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | The intended mobile bottom navigation exists in code and tests but is never mounted in the app shell. | `components/app-nav/app-nav.tsx` supports `orientation="bottom"`; no production caller uses it. `ui/sonner/sonner.tsx` already reserves 88 px above a presumed bottom bar. |
| P0       | Mobile header controls are crowded and undersized.                                                    | At 390 px, menu is 36 × 36, privacy is about 38 × 30, New Entry about 42 × 36, and theme is about 38 × 38.                                                                 |
| P0       | The transaction ledger has a desktop-only four-column grid at every breakpoint.                       | `transactions/components/txn-row.tsx` exports `grid-cols-[2.4fr_1fr_1fr_1.1fr]` without a mobile alternative.                                                              |
| P0       | Import review is wider than a phone and clips its columns.                                            | `imports/components/review-step.tsx` combines fixed date, amount, and category widths with gaps and padding inside `overflow-hidden`.                                      |
| P0       | Modal behavior is inconsistent.                                                                       | The mobile menu locks body scroll, handles Escape, and returns focus. The other dialogs/drawers declare `aria-modal` but do not share those mechanics.                     |
| P1       | Most text inputs and selects use `text-sm` (14 px).                                                   | The shared `Input` and many feature-local controls can trigger Safari auto-zoom when focused.                                                                              |
| P1       | Many interactive targets are below 44 × 44.                                                           | Range tabs, presets, close buttons, filters, icon buttons, month navigation, account/category selectors, and row actions.                                                  |
| P1       | Safe areas are handled only by the toaster.                                                           | No shell, bottom-nav, drawer footer, or auth-layout inset treatment exists.                                                                                                |
| P1       | Mobile browser coverage is narrow.                                                                    | Playwright has Pixel 7 / Mobile Chrome, but no 320–360 px project, Mobile Safari/WebKit project, or route-wide overflow assertions.                                        |

## 3. Scope and Non-Goals

### In scope

- Phone layouts from 320 px through 767 px, plus phone landscape.
- Mobile navigation, safe areas, touch targets, viewport/keyboard behavior, readable data density, dialogs/sheets, forms, empty/loading/error states, and responsive test coverage.
- Small tablet continuity around the existing `md` breakpoint.
- Long names, large INR values, validation errors, and other content-stress cases.

### Out of scope for this pass

- Backend, database, auth, or generated API changes.
- Changes to ledger write behavior, idempotency, paise handling, or append-only rules.
- Offline/PWA implementation; it remains a separate product roadmap item.
- A visual rebrand, new UI library, or new dependency.
- Desktop redesign except where a shared primitive must remain compatible.

## 4. Mobile Standards and Acceptance Targets

These standards apply to every folder below:

- Test widths: 320, 360, 390, and 430 px; test 844 × 390 landscape separately.
- No document-level horizontal scrolling. Deliberate horizontal scrollers must be labeled, keyboard-scrollable, and visibly hinted.
- Primary controls and icon-only controls: at least 44 × 44 CSS px. Compact visual icons may sit inside a 44 px hit area.
- Form controls: at least 16 px text on phones, correct `inputMode`, `name`, `autocomplete`, and inline error association.
- Bottom and edge UI respects `env(safe-area-inset-*)`.
- Sheets use `100dvh`, keep actions visible above the safe area and on-screen keyboard, lock background scroll, close on Escape, trap focus, and restore focus to the opener.
- No information is hover-only. Chart details and row actions work by tap and keyboard.
- Money remains rendered through `<Money>`, `<SignedMoney>`, `formatMinor()`, and `AmountInput`; no inline division or display-string arithmetic.
- Reduced motion remains honored.
- Route state such as filters and selected report month stays URL-backed.

## 5. Folder-by-Folder Implementation Plan

### 5.1 `apps/web/src/app`

#### `app/(app)`

- Mount a new mobile bottom navigation in `(app)/layout.tsx` below `md` and add matching bottom padding to `<main>` so the final content/action cannot sit behind it.
- Reduce phone page padding from 20 px to a 16 px baseline; preserve the current spacing at `sm` and above.
- Keep the header sticky but simplify its phone content: menu, compact current-page label, privacy icon, and Add action. Move theme switching to More/navigation on the narrowest width.
- Make the Add page’s “Transfer between accounts” action full-width or naturally stacked on phones.
- Verify route headers wrap actions below titles instead of leaving narrow orphaned buttons.
- Preserve server-component routing and existing typed loaders.

#### `app/(auth)`

- Replace `min-h-screen` with dynamic viewport sizing and safe-area padding so login/register remain usable when mobile browser chrome or the software keyboard is visible.
- Keep the decorative desktop image hidden on phones; reduce vertical whitespace for short screens.
- Keep inputs at 16 px and enlarge the password visibility and “Keep me signed in” hit areas.

#### Root, error, loading, and not-found files

- Add a typed Next.js viewport/theme-color declaration that matches light/dark surfaces without disabling zoom.
- Add a skip link and stable `main` target in the authenticated and auth shells.
- Give retry/reload/back actions 44 px hit areas and safe phone padding.
- Ensure skeletons approximate the mobile card layouts, not the desktop tables.

#### `globals.css`

- Add reusable safe-area and mobile scroll-padding variables/classes.
- Set intentional `touch-action: manipulation` and tap highlight behavior for interactive controls.
- Add heading anchor scroll margin and retain the existing reduced-motion override.
- Do not hide document overflow as a blanket fix; each overflowing component must be corrected at its source.

### 5.2 `apps/web/src/components`

#### `app-nav`, `app-header`, `mobile-menu`, `app-sidebar`

- Add `MobileBottomNav` using the existing bottom orientation and the product-defined destinations: Dashboard, Transactions, center Add action, Reports, More.
- Treat Add as an action that opens the existing transaction sheet; do not duplicate mutation logic.
- Keep the full-screen menu as the all-destinations surface, but make the bottom rail the primary phone navigation.
- Add bottom safe-area padding, active-route semantics, 44 px targets, and content padding compensation.
- Make header route matching work for nested routes such as transaction, goal, bill, and API-key detail pages.
- Keep desktop sidebar behavior unchanged; only share navigation data and active-route helpers.

#### `ui`

- Create shared `DialogSurface` and `DrawerSurface` primitives (or shared hooks plus shells) for focus trap/return, Escape, backdrop dismissal, body scroll lock, `aria-labelledby`, dynamic viewport height, safe-area footer padding, and reduced motion.
- Migrate all feature overlays to these primitives before feature-specific polish. Do not add a UI dependency without a separate approval.
- Update `Button` sizes so normal mobile actions meet 44 px while preserving an explicit compact desktop-only option.
- Update `Input` and select conventions to 16 px on phones and 14 px from `sm` upward.
- Enlarge `AmountInput` preset hit areas and keep the numeric keypad behavior.
- Verify toaster actions and close controls meet the same target size; retain its bottom-nav offset.
- Add optional scroll-edge affordances for horizontal chip/tab rails.

#### `csv`

- Stack column mapping pairs at phone widths.
- Keep source-column examples and errors below their associated control.
- Replace dense inline actions with full-width or two-column action rows where needed.

### 5.3 `apps/web/src/features`

#### `accounts`

- Stack balance summary blocks cleanly and remove phone-only `min-width` pressure.
- Make account type filters a labeled horizontal rail or wrapping 44 px chips.
- Preserve card-level keyboard access; stack archive/configure actions beneath account metadata on narrow screens.
- Move create, billing-cycle, archive, and detail overlays onto shared mobile dialog/sheet primitives.

#### `api-keys`

- Stack key metadata, scope badges, and rotate/revoke actions.
- Make masked keys and one-time secrets break/scroll within their own container without widening the page.
- Turn scope checkboxes into full-width labeled hit areas; make destructive confirmation phone-safe.

#### `assets`

- Reduce hero padding and stack net-worth submetrics below the primary value on phones.
- Keep long asset names and large amounts from competing on one line.
- Migrate create/history/valuation/close overlays; use a sticky safe-area-aware action footer for long forms.

#### `auth`

- Apply 16 px inputs, 44 px password/checkbox controls, keyboard-safe vertical spacing, and first-error focus.
- Test the complete register form at 320 px and with a reduced-height viewport.

#### `bills`

- Stack bill filters or present them as a horizontally scrollable, labeled control rail.
- Keep bill summary and lifecycle readable as vertically ordered cards on phones.
- Preserve the existing reconciliation card approach, but stack candidate selector, Match, and Acknowledge actions full-width.
- Migrate payment and reconciliation overlays and keep the primary action above the keyboard/safe area.

#### `budgets`

- Stack overview totals and card actions; keep progress and money labels visible at large values.
- Make the budget editor a shared drawer with a sticky footer and phone-sized form controls.
- Keep month/category state and idempotency behavior unchanged.

#### `categories`

- Use a phone-friendly category card/action hierarchy and 44 px filter chips.
- Reduce the icon/type chooser density in the creation sheet at 320 px.
- Migrate create/archive overlays and preserve category color contrast semantics.

#### `category-rules`

- Convert the create-rule desktop row into a stacked phone form.
- Stack pattern, category, match explanation, and delete action in each rule card.
- Keep the rule tester above the list, with a 16 px input and explicit results region.

#### `dashboard`

- Keep the overview single-column on phones and reduce card padding before removing content.
- Enlarge range tabs to 44 px targets; allow the rail to scroll rather than compress labels.
- Give the cash-flow chart a responsive aspect ratio and tap/keyboard-accessible values; do not rely on hover.
- Prevent panel headers, totals, and range controls from fighting for the same row at 320–390 px.

#### `export`

- Make range mode cards/radios one shared 44 px hit area.
- Stack date fields and make the export action full-width on phones.
- Preserve CSV injection protection and existing generated-client workflow.

#### `goals`

- Stack goal hero, plan stats, contribution rows, and actions in a thumb-friendly order.
- Keep progress-ring meaning available as text.
- Migrate editor and abandon overlays; keep the editor footer visible above safe areas.

#### `imports`

- Make the stepper a compact progress indicator that does not wrap unpredictably.
- Stack upload and mapping controls at phone widths.
- Replace the clipped review table with responsive row cards on phones: include toggle, description/date, amount, problems, then category control. Retain the denser row layout at `md` and above.
- Add a sticky review action bar for Back/Save/Commit and keep it above the bottom nav.
- Stack batch stats and actions. Preserve resumability and do not change commit/revert/idempotency behavior.

#### `insights`

- Keep the main/account/activity column first and quick-add second on phones.
- Apply `sticky` to Quick Add only at the desktop breakpoint; it should not trap phone scrolling.
- Reuse shared account creation and input improvements instead of maintaining a second mobile behavior.

#### `profile`

- Stack identity text safely for long email/display names.
- Make edit/save controls full-width where the phone layout benefits.
- Keep appearance/accent controls in settings rather than creating a second mobile preferences screen.

#### `quick-add`

- Optimize the primary path for one thumb: type → amount → account/category → description → Post.
- Make Expense/Income segments and amount presets at least 44 px.
- Use 16 px select/date/description controls and a bottom action that remains reachable above the keyboard.
- Retain a stable idempotency UUID for the mounted form and never regenerate it on re-render.

#### `recurring`

- Stack rule summaries and actions; keep next-run and amount visible before secondary metadata.
- Rework weekday/month-day selectors so 7 columns do not create sub-44 px targets at 320–390 px.
- Migrate the long rule drawer and make its existing sticky footer safe-area-aware.

#### `reports`

- Enlarge previous/next month controls and month chips; add a visual hint that the month rail scrolls.
- Stack totals and breakdown panels; keep labels adjacent to values.
- Add tap-accessible chart details and protect long category/account names.

#### `spending-warnings`

- Make filters a 44 px chip rail and preserve their URL-backed state.
- Stack warning evidence/value pairs and make dismiss/retry actions full-width where necessary.
- Keep status and error updates in polite live regions.

#### `transactions`

- Replace the four-column phone grid with a two-line ledger card: description/category on the left, amount/date on the right; keep the current grid from `md` upward.
- Move filters into a compact summary plus expandable mobile filter sheet. Keep search and filter state in the URL.
- Make transfer rows follow the same phone anatomy and expose reversal without hover.
- Migrate create/detail/reverse overlays; ensure editable metadata remains distinct from immutable money fields.

#### `transfers`

- Stack source/destination, description, amount, and date within transfer cards.
- Make account Swap a 44 px control and the create form keyboard/safe-area aware.
- Migrate create/detail/reverse overlays without changing the double-entry posting flow.

#### Feature folders with `hooks`, `model`, and `server`

- No broad rewrite. Change only what responsive UI requires: URL serialization for collapsible filters, presentation helpers, and fixture/test support.
- Do not change API contracts, monetary types, or server-loader behavior as part of mobile polish.

### 5.4 `apps/web/src/lib`

- Add small shared overlay/focus/scroll-lock helpers only if they belong below UI primitives.
- Preserve API clients, auth, money formatting, theme/accent persistence, privacy behavior, and query keys.
- If phone-specific state is introduced, prefer CSS or URL state; do not create a parallel global mobile store.

### 5.5 `apps/web/src/mocks`

- Add mobile stress fixtures: 60-character descriptions, long account/category names, large INR amounts, many tags, validation failures, empty lists, and dense import/reconciliation data.
- Keep mock response validation aligned with shared schemas.

### 5.6 `apps/web/e2e`, `apps/web/tests`, and colocated tests

- Add Playwright projects for a 320/360 px small Android viewport and Mobile Safari/WebKit in addition to Pixel 7.
- Add route-wide assertions for `scrollWidth === clientWidth` at the document level.
- Add visual snapshots for shell/navigation, transaction rows/filters, quick-add with keyboard-sized viewport, import review, reports, settings, and a long drawer.
- Add keyboard/focus tests for every shared overlay: initial focus, Tab containment, Escape, focus return, and scroll lock.
- Add axe scans for authenticated core routes, not only auth pages.
- Add tests that primary phone targets meet the 44 px contract.

### 5.7 `apps/web/public`, package config, and repository-level folders

- `public`: no planned asset change; verify the existing login hero remains excluded from phone layout and does not affect phone loading.
- `apps/web/package.json`: no new dependency planned.
- `packages/shared`, `apps/api`, migrations, deployment, and infrastructure: no planned changes.
- Documentation: update `docs/frontend/FRONTEND.md` only if approved implementation intentionally changes its navigation or mobile contracts.

## 6. Delivery Phases

### Phase 1 — Mobile foundation (P0)

1. Mobile bottom navigation, compact header, safe-area shell padding, and skip link.
2. Shared dialog/drawer behavior.
3. Shared 44 px button/input/select rules and 16 px phone form text.
4. Core Playwright viewport and overflow helpers.

**Exit gate:** the shell works at 320–430 px; no content sits behind navigation; overlays pass focus/scroll tests.

### Phase 2 — Money capture and ledger (P0)

1. Quick Add and Add route.
2. Transactions and transaction/transfer row anatomy.
3. Transaction filters and create/detail/reversal overlays.
4. Transfers.

**Exit gate:** add, review, filter, open, and reverse flows are comfortably usable one-handed with no money or idempotency regression.

### Phase 3 — Dense financial workflows (P0/P1)

1. Imports and CSV mapping/review.
2. Bills and reconciliation.
3. Recurring rules.
4. Accounts, categories, and category rules.

**Exit gate:** no clipped tables; all long forms keep their action reachable above keyboard and safe area.

### Phase 4 — Planning and analysis surfaces (P1)

1. Dashboard and insights.
2. Reports and spending warnings.
3. Budgets, goals, assets, and export.

**Exit gate:** charts, ranges, totals, and cards work by touch without relying on hover or desktop density.

### Phase 5 — Settings, auth, and hardening (P1)

1. Settings, profile, API keys, login, and register.
2. Long-content and reduced-height stress pass.
3. Mobile Safari, Android Chrome, landscape, axe, and visual regression pass.
4. Update frontend documentation and release notes.

## 7. Suggested Commit Boundaries

Keep implementation reviewable with one logical change per commit, for example:

1. `feat(web): add safe-area mobile navigation shell`
2. `refactor(web): unify accessible dialog and drawer behavior`
3. `fix(web): enforce mobile touch and input sizing`
4. `feat(web): add responsive ledger rows and filters`
5. `feat(web): adapt imports and reconciliation for phones`
6. `feat(web): adapt dashboard and planning features for phones`
7. `test(web): add mobile viewport accessibility coverage`
8. `docs(web): document mobile interaction contracts`

## 8. Verification and Definition of Done

For each phase:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm --filter @treasury-ops/web test:e2e
```

Run `pnpm test:e2e` as well if authenticated routes/auth behavior are touched, per repository rules. The mobile work is complete only when:

- All required repository gates pass with zero TypeScript or lint errors.
- No authenticated route has unintended document-level horizontal overflow at target widths.
- Core tasks pass in Mobile Chrome and Mobile Safari/WebKit.
- Every shared overlay passes focus, Escape, scroll-lock, and focus-return tests.
- No primary mobile target is smaller than 44 × 44.
- Inputs do not trigger iOS zoom, and keyboard-open layouts keep their primary action reachable.
- Ledger and API invariants remain unchanged; money continues to use integer paise and approved shared utilities.

## 9. Review Checkpoints Before Coding

Approval can be given phase by phase. Before implementation starts, confirm:

1. Bottom rail destinations: **Dashboard / Transactions / Add / Reports / More**.
2. Phone ledger choice: two-line responsive cards below `md`, existing grid at `md+`.
3. Filter choice: compact summary + mobile filter sheet, with state still URL-backed.
4. Overlay approach: shared in-repo primitives with no new dependency.
5. Delivery order: foundation → money capture/ledger → dense workflows → analytics → settings/hardening.

These checkpoints were approved on 1 August 2026. Implementation is proceeding on the planning branch in the commit boundaries above.

## 10. Implementation Progress

- [x] Push the reviewed planning document and continue on the same branch.
- [x] Mount a safe-area-aware, one-thumb mobile navigation rail.
- [x] Add shared dialog/drawer focus, Escape, scroll-lock, and focus-return behavior.
- [x] Enforce the first shared 44 px touch targets and 16 px phone inputs.
- [x] Adapt the transaction ledger, filters, create sheet, detail drawer, and reversal flow.
- [x] Add 320 px Mobile Chrome and Mobile Safari browser projects.
- [x] Complete remaining money-capture and transfer route refinements.
- [x] Adapt imports, bills, and recurring workflows for phones.
- [ ] Continue folder-by-folder through accounts, categories, and category rules.
- [ ] Continue through dashboard, reports, budgets, goals, assets, settings, and final hardening.
