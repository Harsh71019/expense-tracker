# TreasuryOps frontend UI standardization plan

**Status:** Proposed

**Scope:** `apps/web` visual language, page composition, interaction states, responsive behavior, and UI governance

**Last audited:** 2026-08-15

**Implementation status:** Planning only; this document does not change application behavior

## 1. Executive summary

TreasuryOps already has a useful visual foundation: semantic color variables, light and dark themes,
accent preferences, shared money rendering, shared buttons and fields, a shared dialog surface, and a
mobile-aware application shell. The inconsistency appears one level above those primitives. Each
feature has independently decided how a page header, toolbar, summary card, panel, empty state,
loading state, and responsive layout should look.

The result is an application that works but does not always feel like one product. For example:

- Accounts, Recurring, and Settings use bordered “command” headers with status chips.
- Transactions, Budgets, Reports, Assets, Bills, Imports, and API Keys use plain headers with large
  ledger-style eyebrows.
- Transfers and Categories use a smaller version of the plain header.
- Quick Add, Export, Insights, transaction detail, and More each use another compact title pattern.
- Similar search/filter toolbars, stat tiles, cards, notices, and loading states are rebuilt inside
  feature files with slightly different spacing, radius, borders, and behavior.

This plan establishes a shared page grammar without making every page identical. Every route should
feel like TreasuryOps, while a dashboard can still behave like a dashboard, a ledger like a dense
ledger, and a focused capture flow like a focused capture flow.

The recommended direction is **calm ledger operations**: precise, restrained, data-first, and usable
one-handed on an unreliable commute. Inter Tight remains the primary interface face; JetBrains Mono
continues to carry amounts, metadata, dates, statuses, and compact labels. The one recognizable
signature is a short **ledger line** attached to the page eyebrow—a small balancing mark that gives
every top-level screen common ownership without turning the app into a decorative theme.

## 2. Goals

1. Make any two top-level pages visibly part of the same application.
2. Give contributors a small set of documented page templates and composition primitives.
3. Reduce feature-local Tailwind recipes for the same visual job.
4. Make hierarchy predictable: page title, page action, summary, controls, content, and states should
   appear in a learnable order.
5. Preserve dense financial information without making mobile screens cramped.
6. Make loading, empty, error, filtered-empty, and success states as intentional as the happy path.
7. Preserve all ledger, money, idempotency, API-client, SSR, and feature-boundary rules in
   `AGENTS.md` and `apps/web/CLAUDE.md`.
8. Achieve the standardization without adding a UI dependency.

## 3. Non-goals

- No backend, API, database, ledger, or money-math changes.
- No rebrand, logo redesign, or replacement of the existing accent preference system.
- No move to another component library.
- No requirement that all pages use the same content density or the same card layout.
- No mass rewrite of feature logic while changing presentation.
- No speculative Zustand, `nuqs`, Storybook, animation, or chart dependencies.
- No change to generated API client behavior.
- No removal of feature-specific data visualization colors where they encode real categories or
  series.

## 4. Audit snapshot

The audit covered the authenticated routes under `apps/web/src/app/(app)`, the feature components
under `apps/web/src/features`, shared UI primitives, and `globals.css`. The working tree contained
active, concurrent frontend standardization edits during the audit. The counts below reflect the
2026-08-15 snapshot; confirm them again before a mechanical cleanup. In particular, `text-2xs` and a
new `StatCard` primitive now exist and should be treated as in-progress foundations rather than
missing work.

### 4.1 What is already strong

- `globals.css` owns semantic surface, foreground, border, accent, income, expense, warning, and
  reversal colors.
- Light, dark, system, and user-selected accent behavior already share CSS variables.
- `Money` and `SignedMoney` provide the correct display path for integer paise.
- `Button`, `Input`, `Select`, `AmountInput`, `DatePicker`, `Badge`, `EmptyState`, `Skeleton`,
  `DialogSurface`, and the newly introduced `StatCard` already cover important low-level jobs.
- The app shell already includes a skip link, mobile bottom navigation clearance, safe-area support,
  visible focus patterns, tabular numerals, and reduced-motion handling.
- Route files are generally thin and let feature components own presentation.
- Tailwind is already the only styling system, so a standard can be introduced without a migration
  between styling technologies.

### 4.2 Measured drift

These counts are a snapshot, not permanent targets. They establish why a composition layer is needed.

| Area                 |                                       Current evidence | Why it matters                                                                    |
| -------------------- | -----------------------------------------------------: | --------------------------------------------------------------------------------- |
| Page titles          |          24 `h1` occurrences use 11 class combinations | Page hierarchy changes when navigating between peers                              |
| Buttons              | 119 shared `<Button>` uses and 169 raw `<button>` uses | Many legitimate icon/segment controls still repeat focus, size, and state recipes |
| Inputs               |     31 shared `<Input>` uses and 32 raw `<input>` uses | Search, checkbox, hidden, and specialized inputs do not share one field grammar   |
| Arbitrary text sizes |                                                37 uses | Small labels and special headlines bypass the type scale                          |
| Arbitrary radii      |                                                36 uses | Panels that perform the same job have 10px, 13px, 18px, 22px, and other radii     |
| Arbitrary tracking   |                                                99 uses | Eyebrows and micro-labels visually drift even when their purpose is identical     |
| `transition-all`     |                                  42 uses across app UI | It produces inconsistent motion and conflicts with current interaction guidance   |
| Shared empty state   |                                                19 uses | A good primitive exists, but several features still implement local variants      |

### 4.3 Root causes

1. There is no shared `PageShell` or `PageHeader`.
2. There is no shared surface/card vocabulary that distinguishes panel, inset, interactive, and
   semantic feedback surfaces.
3. There is no single toolbar/search/filter composition.
4. A `StatCard` has just been introduced, but its contract and adoption are still in progress; it
   currently defaults to glass and hover behavior that may not suit every non-interactive summary.
5. Low-level components exist, but feature pages still hand-build icon buttons, segmented controls,
   field wrappers, links styled as buttons, and inline notices.
6. Existing design documents describe individual features or aspirational architecture, but there is
   no short, enforceable visual contract for every page.

## 5. Product design direction

### 5.1 Subject, audience, and primary job

- **Subject:** a personal financial ledger and planning system.
- **Audience:** one primary owner who needs fast capture and trustworthy review, often on a phone and
  occasionally on a wide desktop.
- **Primary job:** make financial state obvious and the next safe action easy to find.

### 5.2 Design character

TreasuryOps should feel:

- Precise, not sterile.
- Operational, not “enterprise dashboard” theatrical.
- Calm around normal state and unmistakable around risk or destructive state.
- Dense enough for financial review, but not compressed for its own sake.
- Confident about numbers, modest about decoration.

### 5.3 Signature: the ledger line

Top-level `PageHeader` instances use a small mono eyebrow preceded by a short horizontal accent mark.
It resembles a balancing mark or a line in a physical ledger. The mark is the app-wide signature; it
should not be repeated inside every card.

```text
━━  LEDGER / TRANSACTIONS
Transactions                              [Add transaction]
Review posted entries, categories, and reversals.
────────────────────────────────────────────────────────────
```

Rules:

- One ledger line per top-level page, never per section.
- Use a stable taxonomy such as `LEDGER / TRANSACTIONS`, `PLANNING / BUDGETS`, or
  `ANALYSIS / REPORTS`; do not invent marketing labels like “Capital Architecture.”
- Status chips in a page header must represent live state. Decorative “Ledger Synchronized” or
  “Engine Active” chips should be removed unless backed by real data that helps the user act.
- The line uses the selected accent. Income, expense, warning, and reversal colors remain semantic
  and never follow the accent preference.

### 5.4 Self-critique of the direction

The mono eyebrow, green accent, and card-based layout could otherwise look like a generic developer
dashboard. The correction is to make the ledger line meaningful, keep status language factual, use
cards only where they group a real unit, and allow ledger rows/tables to remain visually flat. The
identity comes from consistent financial hierarchy and numeric treatment, not from adding glow,
glass, gradients, or animation everywhere.

## 6. Foundation rules

### 6.1 Color roles

Keep the existing semantic variables and formalize their permitted jobs.

| Token                      | Role                                                          | Must not be used for                   |
| -------------------------- | ------------------------------------------------------------- | -------------------------------------- |
| `surface`                  | App canvas and base field fill                                | Raised cards                           |
| `surface-muted`            | Inset controls, quiet grouped regions, selected-neutral state | Primary CTA                            |
| `surface-elevated`         | Panels, cards, dialogs, toolbars                              | Page background                        |
| `border`                   | Default separation                                            | Active or dangerous emphasis by itself |
| `foreground`               | Primary copy and numbers                                      | Disabled copy                          |
| `foreground-muted`         | Supporting copy, metadata, secondary icons                    | Critical errors                        |
| `accent` / `accent-strong` | Primary action, selected state, focus, ledger line            | Income or “good money”                 |
| `income`                   | Income and genuinely positive financial state                 | General success CTA                    |
| `expense`                  | Expense, destructive action, blocking error                   | Decorative contrast                    |
| `warning`                  | Needs-attention state                                         | Destructive action                     |
| `reversed`                 | Reversed/void ledger state                                    | Disabled controls                      |

Add tokens only when a semantic role is missing. Do not add feature names such as
`--color-budget-card` or route-specific colors.

### 6.2 Typography roles

Use role names through component variants rather than composing a new class string on every page.

| Role               | Recommended treatment                              | Use                                         |
| ------------------ | -------------------------------------------------- | ------------------------------------------- |
| Page eyebrow       | Mono, `text-2xs`, bold, uppercase, wide tracking   | One per top-level page                      |
| Page title         | Sans, `text-3xl sm:text-4xl`, bold, tight tracking | Standard top-level pages                    |
| Compact task title | Sans, `text-2xl sm:text-3xl`, bold                 | Focused forms and compact detail pages only |
| Section title      | Sans, `text-lg sm:text-xl`, bold                   | Major regions inside a page                 |
| Card title         | Sans, `text-sm` or `text-base`, semibold/bold      | One content unit                            |
| Body               | Sans, `text-sm`, relaxed where explanatory         | Default copy                                |
| Metadata           | Mono, `text-xs` or `text-2xs`, medium/semibold     | Dates, IDs, status, compact labels          |
| Money hero         | Existing `Money` size variant                      | Important totals only                       |
| Tabular value      | Mono or current money face with tabular numbers    | Comparable values and columns               |

Implementation rules:

- Replace arbitrary page-heading sizes such as `sm:text-[36px]` with a named role.
- Keep `text-2xs` as the smallest supported interface size. Do not introduce text below 10px.
- Use sentence case for page and section titles. Uppercase is reserved for compact mono metadata.
- Keep descriptions below roughly 65 characters per line with `max-w-xl` or a component-owned
  equivalent.
- Long names and descriptions must truncate, clamp, or wrap intentionally.

### 6.3 Spacing rhythm

Adopt a small composition rhythm rather than forbidding Tailwind’s half steps everywhere.

| Relationship                | Standard                        |
| --------------------------- | ------------------------------- |
| Page header to first region | `gap-6` desktop, `gap-5` mobile |
| Major page regions          | `gap-6` or `space-y-6`          |
| Closely related panels      | `gap-4`                         |
| Card content groups         | `gap-3`                         |
| Label to control            | `gap-1.5`                       |
| Inline icon to text         | `gap-2`                         |

Half-step spacing is allowed inside compact controls when it is owned by a primitive. It should not
be repeatedly decided in feature components.

### 6.4 Radius and elevation

Use radius by role:

| Role                       | Radius                                          | Elevation                                                   |
| -------------------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| Button/input/small control | `rounded-lg`                                    | None                                                        |
| Toolbar/inset group        | `rounded-xl`                                    | None or `shadow-xs` when sticky                             |
| Card/panel/dialog          | `rounded-2xl`                                   | Border first; `shadow-xs` only when elevation is meaningful |
| Pill/status                | `rounded-full` or `rounded-md` based on content | None                                                        |

Arbitrary radii should be removed unless geometry requires them, such as a chart shape. “18px feels
nicer here” is not a geometry requirement.

`glass-card` should not be the default panel style. Backdrop blur is reserved for overlays, sticky
navigation, or a surface visibly crossing content. Standard content panels use an opaque
`surface-elevated` background so hierarchy remains clear in both themes.

### 6.5 Motion

- Use motion for state change, not ambient decoration.
- Standard durations: 100ms press, 150ms color/focus, 200–240ms overlay entrance.
- Animate `transform` and `opacity` only where practical.
- Replace `transition-all` with explicit properties.
- Keep interactions interruptible.
- Respect reduced motion at the component level as well as the existing global fallback.
- Remove pulsing dots that do not represent a changing or live state.

## 7. Page grammar

Every authenticated screen should use one of five templates.

### 7.1 Template A: overview

Use for dashboard-style pages that summarize several domains.

```text
[PageHeader: title, description, optional period control]
[Primary summary or 3–4 stat cards]
[Two-column analytical panels]
[Secondary panels]
```

Routes: `/`, `/insights`, potentially `/assets` when net worth is the lead story.

### 7.2 Template B: resource index

Use for searchable/filterable collections.

```text
[PageHeader                                      Primary action]
[Optional summary strip]
[Toolbar: search | filters | view | sort]
[Active filter chips]
[Grid, table, or list]
[Pagination/load more]
```

Routes: `/transactions`, `/accounts`, `/transfers`, `/categories`, `/category-rules`, `/budgets`,
`/bills`, `/goals`, `/recurring`, `/spending-warnings`, `/settings/api-keys`.

### 7.3 Template C: focused task

Use when the user should complete one primary flow with minimal distraction.

```text
             max-width: narrow
[Compact PageHeader]
[Task panel or stepper]
[Inline help/error]
[Sticky or normal action footer]
```

Routes: `/add`, `/imports` while the wizard is active, `/export`, authentication routes.

### 7.4 Template D: detail

Use for a single resource and its related activity.

```text
[Breadcrumb or BackLink]
[PageHeader: resource identity, status, contextual actions]
[Primary amount/progress summary]
[Metadata and related activity]
[Danger zone separated at the end]
```

Routes: `/transactions/[transactionId]`, `/bills/[billId]`, `/goals/[goalId]`.

### 7.5 Template E: settings/workspace

Use for grouped configuration.

```text
[PageHeader]
[URL-backed tabs]
[Section header]
[Settings groups]
```

Routes: `/settings` and its profile, appearance, and management tabs. `/more` is a compact
navigation directory and may use the same header scale without settings panels.

## 8. Shared composition components

Add these incrementally under `apps/web/src/components/ui`. They contain no business logic and do not
fetch data.

### 8.1 `PageShell`

Owns page width, horizontal centering, entrance behavior, and vertical rhythm.

Recommended variants:

- `wide`: dashboards and dense resource indexes.
- `standard`: most list/detail/settings pages.
- `narrow`: focused forms such as Quick Add and Export.

It should eliminate route-specific values such as `max-w-[940px]`, `max-w-[520px]`, and bespoke
root `space-y-*` combinations. The global app layout continues to own outer responsive padding.

### 8.2 `PageHeader`

Owns:

- Ledger line and eyebrow taxonomy.
- Title and description typography.
- Optional primary/secondary actions.
- Optional factual metadata or status.
- Default and compact size variants.
- Mobile stacking and full-width primary action behavior.

It must not contain domain logic or manufacture status copy.

### 8.3 `SectionHeader`

Owns an `h2`, optional description, optional action, and consistent bottom spacing. Use it above
groups such as “Needs attention,” “Recent activity,” “Archived,” and “Account flow.”

### 8.4 `Surface`

Provides a controlled visual vocabulary:

- `panel`: standard elevated content container.
- `inset`: quiet nested group.
- `interactive`: clickable resource card with hover, active, and focus behavior.
- `semantic`: requires an intent such as info, warning, danger, or success.

Feature-specific layout remains in the feature. `Surface` owns border, background, radius, and the
permitted elevation—not business content.

### 8.5 `StatCard`

The in-progress primitive already provides a shell, label, and value. Validate and refine it so it
supports the proven common needs: an optional icon, supporting text, delta, and semantic intent. Its
default should not imply hover interactivity when the card is static. It should cover the common core
of dashboard stats, recurring stats, goal totals, budget overview, bill totals, and account summaries
without forcing every analytical panel into a stat tile.

### 8.6 `Toolbar`

Provides consistent wrapping, active-state border, mobile stacking, and regions for:

- Search.
- Filter controls.
- Sort.
- Segmented view control.
- Optional result count.
- Active filter chips below the primary row.

The toolbar should synchronize shareable filters with the URL where the page already supports URL
state. Standardization must not silently move URL-backed state into local React state.

### 8.7 `SearchField`, `IconButton`, and `SegmentedControl`

These absorb repeated raw-control recipes:

- `SearchField`: label or `aria-label`, search icon, clear action, long-query handling, and consistent
  focus-within state.
- `IconButton`: size, hit target, visible focus, disabled state, and required accessible label.
- `SegmentedControl`: selected state, arrow-key behavior where appropriate, and consistent geometry.

Raw buttons remain valid for unique semantic controls, but not for rebuilding these three patterns.

### 8.8 `Field`, `FieldError`, and `FieldHint`

The existing `Input` owns its own label, while `Select`, custom search inputs, date fields, checkboxes,
and amount inputs often build labels and errors differently. Introduce shared field composition so
all controls can receive:

- A visible clickable label.
- Optional/required metadata.
- Supporting hint.
- Inline error tied through `aria-describedby`.
- A consistent label and error text role.

This should be an additive composition API; do not rewrite every form in the first primitive PR.

### 8.9 `InlineNotice`

Standardizes informational, warning, success, and blocking-error callouts. It should replace plain
bordered paragraphs that currently look different across budgets, imports, recurring, auth, and
other features.

### 8.10 Existing primitives to retain

- `Button`: extend only when repeated needs are proven, such as an icon slot or link-compatible class
  recipe. Do not place navigation inside a `<button>`.
- `Badge`: use only for short state, not as decorative prose.
- `EmptyState`: add optional filtered-empty treatment if necessary; do not fork it per feature.
- `Skeleton`: make it the only loading-placeholder primitive.
- `DialogSurface`: keep as the overlay foundation and continue the documented dialog/sheet/drawer
  naming rule.
- `Money` and `SignedMoney`: remain the only money renderers.

## 9. Content component standards

### 9.1 Primary and secondary actions

- One primary action per page header.
- Use a specific verb and object: “Add budget,” “Create account,” “Start import,” “Save changes.”
- Secondary actions use the secondary/outline treatment.
- Tertiary actions use ghost styling.
- Destructive actions are visually dangerous only when they cause destruction; do not make every
  archive link red by default.
- Navigation actions use `Link` with a shared link-button recipe, not `onClick` routing.
- On mobile, the primary page action may become full-width when it is the clear next step.

### 9.2 Cards, rows, and tables

- Use a card when an item has several attributes and independent actions.
- Use a row/table when users need comparison or scanning across many items.
- Do not wrap every analytical number in a card.
- Clickable cards must have one unambiguous interactive target and visible keyboard focus.
- Nested actions must not create invalid nested interactive elements.
- Financial columns use tabular numbers and right alignment where comparison benefits.
- Lists longer than 50 rendered items need a deliberate performance review; preserve cursor
  pagination and consider virtualization only after measuring and obtaining dependency approval.

### 9.3 Forms

- One consistent field label, hint, and inline error arrangement.
- `min-h-11` remains the default touch target.
- Use the correct input type, input mode, name, and autocomplete behavior.
- Do not block paste.
- Submission copy changes to “Saving…”, “Creating…”, or the exact active verb.
- Disable the submit action only after submission starts or when required client-side preconditions
  are visibly unmet.
- Focus the first invalid field after submission.
- Warn before leaving multi-step flows with unsaved work.
- Mutation forms keep their existing mount-scoped idempotency keys.

### 9.4 Loading, empty, error, and filtered-empty states

Every page region that loads asynchronously must define all relevant states:

| State              | Standard behavior                                                           |
| ------------------ | --------------------------------------------------------------------------- |
| Initial loading    | Skeleton mirrors final geometry; avoid a lone “Loading…” paragraph          |
| Background refresh | Keep content visible; use subtle busy affordance only if helpful            |
| Empty first-use    | Explain what belongs here and offer the next safe action                    |
| Empty after filter | Preserve controls and explain how to clear or broaden filters               |
| Recoverable error  | State what failed and provide “Try again” near the affected region          |
| Mutation pending   | Keep layout stable, show exact progress verb, prevent duplicate interaction |
| Success            | Toast or inline confirmation uses the same verb as the action               |

### 9.5 Charts and analytical panels

- A panel header always names the measure and period.
- Legends, axes, tooltips, and empty states use the same semantic colors and numeric formatting.
- Do not use the accent color for both “selected UI” and a financial series when that creates
  ambiguity.
- Chart panels share `Surface` geometry with non-chart panels.
- Avoid decorative gradients and glow behind charts; data should provide the visual emphasis.

## 10. Responsive standards

Design from three practical widths rather than treating responsiveness as arbitrary breakpoints:

1. **Phone (320–639px):** one-handed capture and review.
2. **Tablet/small desktop (640–1023px):** stacked or two-column cards with the full header.
3. **Desktop (1024px+):** comparative grids and dense ledger rows.

Required behavior:

- No horizontal page scrolling at 320px.
- Page headers stack; primary actions become easy to reach without covering content.
- Toolbars put search first, then horizontally scroll or wrap filters intentionally.
- Tables either become purpose-designed mobile rows or provide an explicitly labeled scroll region;
  columns must not simply disappear without preserving their information.
- Sticky sheet/form footers include safe-area padding.
- Mobile bottom navigation clearance remains owned by the app layout.
- Touch targets remain at least 44px for primary controls and icon buttons.
- Hover effects must not be the only indication of interactivity.

## 11. Accessibility and interaction baseline

The standardization work is not complete if it only makes screenshots look consistent.

- Preserve one `h1` per route and hierarchical `h2`/`h3` structure.
- Use semantic buttons for actions and links for navigation.
- Require an accessible label for every icon-only button.
- Decorative icons use `aria-hidden="true"`.
- Form controls receive visible labels or a justified accessible label.
- Async feedback and validation are announced through the appropriate live region.
- Every interactive element has a visible `focus-visible` treatment.
- `outline-none` is allowed only with a replacement focus style.
- Dialogs retain focus trapping, focus restoration, Escape behavior, `aria-modal`, and contained
  overscroll.
- URL-backed tabs and filters remain deep-linkable.
- Theme colors must be checked for text, icon, border, focus, and semantic-state contrast in light
  and dark themes and across every accent preset.
- Use `Intl` or the established shared formatter for dates, numbers, and currency.
- Loading text and placeholders use the ellipsis character (`…`).

## 12. Route-by-route migration matrix

The matrix sets the target template and the main visual work. It does not authorize changing feature
behavior.

| Route                 | Template                      | Main standardization work                                                                                                                                           |
| --------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                   | Overview                      | Adopt `PageShell`/`PageHeader`; normalize dashboard panel surfaces and stat cards; keep full-width analytical layout                                                |
| `/insights`           | Overview                      | Resolve naming relationship with Dashboard in copy; replace compact email/title strip with the overview header grammar; standardize its balance and activity panels |
| `/transactions`       | Resource index                | Make pending transactions a clearly labeled pre-list region; unify header, insights stats, toolbar, view control, ledger container, and skeleton geometry           |
| `/transactions/[id]`  | Detail                        | Add standard back/breadcrumb treatment, compact detail header, metadata sections, and isolated reversal action                                                      |
| `/add`                | Focused task                  | Make route-level transfer link a secondary header action; use narrow shell, compact header, standard field composition, and stable submit footer                    |
| `/accounts`           | Resource index                | Remove decorative command-status chips; move net worth to a real summary surface; standardize toolbar, filter chips, account cards, and actions                     |
| `/transfers`          | Resource index                | Raise header to the standard title scale; reuse toolbar and ledger-row patterns from Transactions where semantics match                                             |
| `/categories`         | Resource index                | Standardize header, summary stats, kind/view segments, toolbar, active-filter chips, category cards, and archived rows                                              |
| `/category-rules`     | Resource index                | Replace bespoke KPI tiles and filter controls; keep rule tester as a distinct functional panel                                                                      |
| `/budgets`            | Resource index                | Standardize header and toolbar; turn explanatory paragraph into `InlineNotice`; reuse stat and section-header patterns                                              |
| `/bills`              | Resource index                | Standardize list header, filters, card grid, empty/loading states; keep bill lifecycle semantics                                                                    |
| `/bills/[id]`         | Detail                        | Convert bill summary into the detail header/summary grammar; standardize reconciliation and action sections                                                         |
| `/assets`             | Overview/resource hybrid      | Keep net worth as the lead summary; standardize asset toolbar/cards and make valuation history a detail surface                                                     |
| `/goals`              | Resource index                | Replace local summary tiles; standardize active/achieved sections, toolbar, and goal cards                                                                          |
| `/goals/[id]`         | Detail                        | Standard back/header/progress summary; consistent contribution list, empty/error states, and separated abandon action                                               |
| `/recurring`          | Resource index                | Remove decorative engine chips and pulse; standardize header, stats, toolbar, rule rows/cards, reconciliation review, and loading state                             |
| `/reports`            | Overview                      | Standard page header and month control; normalize total cards, chart panels, legends, and empty report state                                                        |
| `/spending-warnings`  | Resource index                | Standard header and filter toolbar; convert analysis state and warnings to shared semantic surfaces                                                                 |
| `/imports`            | Resource index → focused task | Use index grammar for batch history; switch to a focused task shell when the wizard starts; standardize stepper, notices, and action footer                         |
| `/export`             | Focused task                  | Adopt narrow shell, compact header, field composition, explanatory notice, and standard download progress/success states                                            |
| `/settings`           | Settings                      | Remove decorative command chips; use standard header, URL-backed tabs, section headers, and settings-group surfaces                                                 |
| `/settings/api-keys`  | Resource index/detail hybrid  | Standard header width, toolbar, create form, key rows, reveal state, and destructive revoke confirmation                                                            |
| `/more`               | Navigation directory          | Use compact standard page header and interactive surface tiles; ensure every tile has consistent focus/hover behavior                                               |
| `/login`, `/register` | Focused auth                  | Keep distinct auth shell, but align fields, buttons, notices, spacing, and copy with the authenticated app                                                          |

## 13. Implementation sequence

Work in small, reviewable PRs. Do not combine a broad visual sweep with domain behavior changes.

### Phase 0 — baseline and decisions

**Deliverables**

- Capture stable screenshots for light/dark at 390px, 768px, and 1440px for representative routes.
- Record the current UI state for Dashboard, Transactions, Accounts, Quick Add, Reports, Settings,
  and one detail page.
- Approve the design direction, ledger-line signature, five page templates, title scale, surface
  roles, and radius rules.
- Classify all existing hardcoded colors as semantic token candidates or legitimate data-viz data.

**Exit criteria**

- The team can place every route into exactly one primary template.
- No design token decision is still being made inside the first feature migration.

### Phase 1 — foundations and composition primitives

**Deliverables**

- Add `PageShell`, `PageHeader`, `SectionHeader`, `Surface`, and `InlineNotice`.
- Add or finalize `StatCard`, `Toolbar`, `SearchField`, `IconButton`, and `SegmentedControl` only after
  checking the superset of existing usages.
- Add `Field`, `FieldHint`, and `FieldError` composition around existing controls.
- Document variants and examples in `apps/web/CLAUDE.md` or a concise UI standards reference linked
  from it.
- Add unit/component tests for semantic heading output, accessible labels, variants, disabled/loading
  behavior, keyboard interaction, and class contracts that materially affect layout.

**Exit criteria**

- Each primitive is used by at least one real page; no speculative component is merged unused.
- The primitives contain no feature imports or business copy.
- Light, dark, and all accent presets render the primitives correctly.

### Phase 2 — pilot pages

Migrate three pages that exercise different needs:

1. **Transactions** — dense resource index, summary, filters, rows, pagination, pending region.
2. **Accounts** — summary surface, card grid, filters, empty state, create/detail overlays.
3. **Quick Add** — narrow focused task, specialized fields, mobile priority, idempotent mutation.

Why these three: together they validate almost every shared composition decision before the rest of
the app is touched.

**Exit criteria**

- All three pages pass keyboard-only use at phone and desktop widths.
- Their headers, controls, surfaces, states, and actions look related without sharing feature markup.
- Quick Add remains a fast one-handed flow and does not gain decorative friction.
- No ledger/API behavior changed.

### Phase 3 — core management pages

Migrate Transfers, Categories, Category Rules, Budgets, Bills list, Goals list, Recurring, and API
Keys. Group PRs by reusable pattern, not by how many files can fit in one diff.

Suggested batches:

- Toolbar + filters: Transfers, Categories, Budgets, API Keys.
- Stat/summary cards: Category Rules, Goals, Recurring, Bills.
- Row/card action hierarchy: Categories, Recurring, API Keys.

**Exit criteria**

- No feature-local page header recipe remains in these routes.
- Search, filter, sort, active-filter, and view controls use the shared grammar.
- Loading, empty, filtered-empty, and error states are present and tested.

### Phase 4 — analysis and overview pages

Migrate Dashboard, Insights, Assets, Reports, and Spending Warnings.

Focus on:

- Panel titles and period context.
- Comparable stat treatment.
- Chart legend, tooltip, and empty-state behavior.
- Responsive two-column layouts.
- Removing decorative visual effects that compete with the data.

**Exit criteria**

- Analytical panels share the same surface and header grammar.
- Income, expense, warning, reversal, category, and accent colors remain semantically distinct.
- There is no avoidable cumulative layout shift as charts and data resolve.

### Phase 5 — workflows, detail, settings, and auth

Migrate Imports, Export, all detail routes, Settings, More, Login, and Register.

Focus on:

- Focused-task width and action footers.
- Stepper and unsaved-work behavior.
- Detail hierarchy and danger-zone separation.
- URL-backed tabs.
- Dialog/sheet/drawer consistency.
- Form labels, hints, errors, pending states, and autocomplete.

**Exit criteria**

- Every top-level route uses a documented template.
- Overlay type matches purpose: dialog for confirmation, sheet for create/edit, drawer for
  read-heavy detail.
- Destructive actions require confirmation or the existing recoverable flow.

### Phase 6 — cleanup and governance

**Deliverables**

- Replace remaining arbitrary page typography/radius/tracking values with roles or document the
  genuine exceptions.
- Replace remaining `transition-all` with explicit transitions.
- Replace hand-rolled loading placeholders with `Skeleton`.
- Remove obsolete CSS utilities only after no usages remain.
- Add a UI review checklist to the repository contribution guidance.
- Add stable Playwright coverage for representative templates and mobile overflow.

**Exit criteria**

- No duplicate top-level page-header recipe remains.
- Every arbitrary value in a composition component has an explanatory reason.
- All required repository checks pass.

## 14. Verification strategy

### 14.1 Per-primitive tests

- Semantic element and heading level.
- Accessible name and description wiring.
- Loading/disabled state.
- Keyboard interaction for segmented controls and icon buttons.
- Variant coverage where a variant changes semantics or structure.

### 14.2 Per-page component tests

- Header title and primary action.
- Initial loading, empty, filtered-empty, error, and populated states.
- Filter clear behavior and URL preservation where applicable.
- Mobile action layout when it changes interaction order.
- Dialog/sheet/drawer open, close, focus restoration, and destructive confirmation behavior.

### 14.3 End-to-end checks

Use the existing Playwright setup for a small representative matrix:

| Template            | Representative route       | Widths         |
| ------------------- | -------------------------- | -------------- |
| Overview            | Dashboard                  | 390, 768, 1440 |
| Resource index      | Transactions               | 390, 1440      |
| Card resource index | Accounts                   | 390, 1440      |
| Focused task        | Quick Add                  | 390, 768       |
| Detail              | Goal or transaction detail | 390, 1440      |
| Settings            | Settings                   | 390, 1440      |

Assert behavior and absence of horizontal overflow before adding broad screenshot assertions. If
visual snapshots are adopted, stabilize dates, animation, fonts, API data, and theme first so the
suite does not become flaky.

### 14.4 Manual review matrix

For every migrated template:

- Light theme.
- Dark theme.
- Default accent plus ocean, indigo, violet, and amber.
- 200% browser zoom.
- Keyboard only.
- Reduced motion.
- Empty, long-content, and large-number data.
- 320px minimum width and a safe-area mobile viewport.

### 14.5 Required repository gates

Run the full definition of done from the repository root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
```

Also run `pnpm test:e2e` for route, navigation, auth, or interaction changes. Visual-only work does not
lower the project’s zero-error TypeScript requirement.

## 15. Governance rules

Add these rules to the frontend contribution guidance after the primitives land:

1. New top-level routes must choose one of the five page templates.
2. New pages use `PageShell` and `PageHeader`; exceptions require a documented reason.
3. New repeated surface recipes graduate to a shared primitive after the third proven use.
4. Feature-specific business components may compose shared UI but may not add feature logic to
   `components/ui`.
5. Do not add arbitrary page title sizes, panel radii, or eyebrow tracking.
6. Do not use `transition-all`.
7. Do not use decorative status chips or pulsing state indicators.
8. Every new asynchronous region defines loading, empty, error, and populated behavior.
9. Every new icon-only action has an accessible label and at least a 44px target.
10. New UI dependencies require explicit approval and must solve a measured gap.

### Pull request UI checklist

- [ ] Route uses the correct page template.
- [ ] One `h1`; section headings follow hierarchy.
- [ ] Primary action is singular, specific, and in the expected location.
- [ ] Shared surface, toolbar, stat, field, and state primitives are used where applicable.
- [ ] Money uses `Money`, `SignedMoney`, or `formatMinor()` from shared code.
- [ ] Loading, empty, filtered-empty, error, pending, and success states are handled.
- [ ] Keyboard focus is visible and the flow works without a pointer.
- [ ] Mobile works at 320px without horizontal page overflow.
- [ ] Light, dark, and accent themes preserve semantic colors and contrast.
- [ ] Motion respects reduced-motion preference and avoids `transition-all`.
- [ ] No behavior, idempotency, tenancy, or ledger invariant changed unintentionally.
- [ ] Tests and required repository gates pass.

## 16. Risks and mitigations

| Risk                                                    | Mitigation                                                                              |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| A “standardization” PR becomes a full redesign          | Lock the foundation decisions in Phase 0 and migrate one pattern at a time              |
| Shared components become giant prop-driven abstractions | Share visual jobs only; keep domain layout and copy inside features                     |
| Every page becomes card-heavy and visually flat         | Use cards for grouped units, rows for comparison, and open canvas for hierarchy         |
| Feature behavior breaks during JSX movement             | Keep behavior changes out of visual PRs and preserve existing component tests           |
| Dark/accent themes drift                                | Review the full theme matrix at primitive and pilot phases                              |
| Mobile regresses while desktop improves                 | Use phone-width acceptance criteria in every phase, not as final polish                 |
| Screenshots become brittle                              | Prefer behavior/overflow assertions; stabilize data and motion before snapshots         |
| Arbitrary values return                                 | Document roles, add review checklist, and periodically audit with `rg`/lint rules       |
| Existing in-progress work conflicts with the sweep      | Rebase migrations by page, preserve unrelated edits, and avoid mass mechanical rewrites |

## 17. Definition of done

The UI standardization initiative is complete when:

- Every authenticated and auth route uses a documented page template.
- Peer pages use the same header hierarchy, width strategy, spacing rhythm, and action placement.
- Shared components own repeated page, surface, toolbar, stat, field, and feedback recipes.
- Feature components retain their domain-specific content and layout decisions.
- Loading, empty, filtered-empty, error, and mutation states are consistent and accessible.
- The application works without horizontal overflow at 320px and remains usable at 200% zoom.
- Keyboard, focus, reduced-motion, theme, and accent checks pass on representative templates.
- No money, ledger, API, idempotency, or tenancy behavior has changed.
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` pass, with E2E run where
  required.

## 18. Recommended first implementation PR

Keep the first PR deliberately small:

1. Add `PageShell`, `PageHeader`, and `SectionHeader` with tests.
2. Add the ledger-line styling using existing tokens.
3. Migrate only `/transactions` to prove the standard resource-index header and spacing.
4. Preserve its current data hooks, filters, pending transactions, insights, pagination, and
   idempotent mutations unchanged.
5. Capture phone and desktop before/after screenshots in the PR description.

Do not add `Surface`, `Toolbar`, `StatCard`, and field composition to the same PR unless the
Transactions migration proves they are required and their contracts are already clear. The goal of
the first PR is to validate the page grammar, not to build an entire design system in one diff.
