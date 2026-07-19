# Vyaya Frontend Standards — Next.js Web Client (2026)

> Scope: everything that ships to the browser or renders on the Next.js server. Backend (NestJS API) has its own doc. This covers architecture patterns, the frontend library stack, dev tooling, testing, performance, and accessibility — researched against the 2026 ecosystem state.

---

## 1. Architecture: The RSC + TanStack Query Hybrid

The 2026 consensus architecture for data-heavy Next.js apps is **Server Components for initial data, TanStack Query for interactivity** — not either/or. This is the "hybrid" model: fast first paint from the server, then optimistic updates, background refetching, and cache management on the client.

### 1.1 The pattern

```
[RSC page] --server-fetch--> prefetch into QueryClient
     │
     ▼
<HydrationBoundary state={dehydrate(queryClient)}>
     │
     ▼
[Client Component] --useQuery(same key)--> instant data, no spinner,
                                            then background refetch + mutations
```

```tsx
// app/(dashboard)/transactions/page.tsx  (Server Component)
export default async function TransactionsPage() {
  const queryClient = makeQueryClient(); // per-request! never module-level
  await queryClient.prefetchQuery({
    queryKey: txnKeys.list({ month: currentMonth }),
    queryFn: () => api.transactions.list({ month: currentMonth }),
  });
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <TransactionList month={currentMonth} />
    </HydrationBoundary>
  );
}
```

**Critical rules:**

1. **Per-request QueryClient isolation.** A module-level `QueryClient` on the server leaks data *between users*. Always create it inside the request (factory function), and on the client memoize one instance in a provider.
2. **Query key factories, not inline arrays.** Inline keys (`["transactions", month]` scattered across files) cause typo-driven cache misses and broken invalidation. Centralize:

```ts
// lib/query-keys.ts
export const txnKeys = {
  all: ["transactions"] as const,
  lists: () => [...txnKeys.all, "list"] as const,
  list: (filters: TxnFilters) => [...txnKeys.lists(), filters] as const,
  detail: (id: TransactionId) => [...txnKeys.all, "detail", id] as const,
};
export const budgetKeys = { /* same shape */ };
```

   Invalidation becomes surgical: after adding an expense, `invalidateQueries({ queryKey: txnKeys.lists() })` refreshes every list variant but not unrelated caches.
3. **Beware dueling caches.** Next.js has its own server-side caching (`fetch` cache, `use cache`) *and* TanStack Query caches on the client. If they disagree, the server serves stale HTML while the client has fresh data (or vice versa). Rule: for anything mutable (transactions, budgets), disable Next's fetch caching (`cache: "no-store"` or dynamic rendering) and let TanStack Query own freshness. Reserve Next's cache for genuinely static data (category icon lists, marketing pages).
4. **Mutations own their invalidations.** Every `useMutation` declares which key families it invalidates in `onSettled`. Co-locate this in a custom hook (`useAddTransaction`) so no component ever calls the raw mutation.

### 1.2 Server Components discipline

* Default to Server Components; add `"use client"` only at interactivity boundaries (forms, charts with tooltips, anything with `useState`/handlers).
* Push `"use client"` **down the tree** — a client leaf inside a server page, never a client page wrapping server children it doesn't need to.
* Never import server-only modules (DB clients, secrets) into client files. Add the `server-only` package to poison-pill those imports at build time.
* Server Actions: fine for simple mutations, but since Vyaya has a real NestJS API, keep mutations going through the API client for one source of truth. Don't split write paths between Server Actions and REST.

### 1.3 Client state: keep it tiny

With TanStack Query owning server state, genuine client state shrinks to UI concerns: sidebar open, active filter panel, draft form steps, theme.

* **Zustand** for shared UI state. One small store per domain concern, not one god store. Use selectors (`useStore(s => s.sidebarOpen)`) to avoid over-rendering.
* **Jotai** only if you find yourself with genuinely atomic, fragmented state (rare in a CRUD app — skip unless proven need).
* **URL as state** for anything shareable/bookmarkable: selected month, filters, sort order live in `searchParams`, not a store. Use **`nuqs`** (type-safe searchParams state manager for Next.js) — this makes "send me the March report link" work for free and survives refresh.

**Decision table:**

| State | Where it lives |
|---|---|
| Transactions, budgets, categories | TanStack Query cache |
| Selected month, filters, sort | URL via `nuqs` |
| Sidebar/modal/toast state | Zustand |
| In-progress form values | React Hook Form |
| Theme | `next-themes` |

---

## 2. Forms & Validation

* **React Hook Form** + **Zod** via `@hookform/resolvers`. Uncontrolled inputs keep re-renders near zero even on long forms.
* **Share schemas with the backend.** Put Zod schemas in a shared package/folder (`shared/schemas`) imported by both the Next.js app and NestJS API. The frontend validates for UX; the backend validates for truth; both use the *same schema* so they can never drift.
* **Amount input**: `react-number-format` for the ₹ masked input; RHF stores the raw value; on submit, convert to integer paise **once** at the API-client boundary:

```ts
const CreateTxnForm = z.object({
  amount: z.string().transform((v) => Math.round(parseFloat(v.replace(/,/g, "")) * 100)),
  txnDate: z.string().date(),           // calendar date, not instant
  categoryId: z.string().ulid(),
  note: z.string().max(200).optional(),
});
```

* Multi-step forms (e.g., import wizard): keep step state in RHF with a single schema per step, compose with `z.intersection` at the end. Don't reach for a form library plugin.
* Error display: field-level inline + a form-level summary for a11y (screen readers announce the summary via `role="alert"`).

---

## 3. UI Layer

### 3.1 Styling & components

* **Tailwind CSS v4** — CSS-first config (`@theme` in CSS, no `tailwind.config.js` for tokens), native cascade layers, faster builds. Define Vyaya's design tokens (spacing scale, category colors, semantic colors like `--color-expense` / `--color-income`) as CSS variables in `@theme` so charts and components share one palette.
* **shadcn/ui** primitives (Radix under the hood), copied into `components/ui/`. You own the code — customize freely, but keep a rule: **never edit `components/ui/*` for feature-specific needs**; wrap them in `components/` feature components instead, so upstream shadcn updates stay mergeable.
* `cn()` (`clsx` + `tailwind-merge`) for conditional classes; `class-variance-authority` (cva) for component variants — shadcn already establishes this pattern, extend it rather than invent a parallel one.
* Dark mode via `next-themes` + Tailwind `dark:` — table stakes for a finance app used at night.

### 3.2 The finance-app component kit

| Concern | Library | Notes |
|---|---|---|
| Transaction table | **TanStack Table v8** (headless) | Sorting, grouping by date, column visibility. Markup is yours (shadcn `<Table>`) |
| Long lists | **TanStack Virtual** | Virtualize past ~200 rows; a year of data is thousands |
| Charts | **Recharts** | Category pie, monthly bar, trend line. Wrap each chart in a client component; feed it pre-aggregated data from the API — never aggregate thousands of raw txns in the browser |
| Date range picker | **react-day-picker** | What shadcn Calendar wraps; range mode for custom report periods |
| Currency display | `Intl.NumberFormat("en-IN")` | Native lakh/crore grouping; wrap in one `<Money amountMinor={...} />` component used everywhere — a single choke point for formatting |
| Toasts | **sonner** | "Expense added ✓" with an Undo action (pairs with optimistic mutation rollback) |
| Command palette | **cmdk** | ⌘K "add expense / jump to month" — cheap, high-perceived-quality |
| Animations | **motion** (Framer Motion successor) | Sparingly: list item enter/exit, number count-ups. Respect `prefers-reduced-motion` |

### 3.3 Money & dates on the client — display only

The frontend **never does money math**. Totals, splits, month buckets all come pre-computed from the API. The client's only money job is `formatINR(amountMinor / 100)` at render. Same for dates: display with `date-fns` `format`, but bucketing logic (which month does this txn belong to) is server-owned. This keeps web and any future mobile client consistent by construction.

---

## 4. Frontend Dev Dependencies

Beyond the shared toolchain (ESLint flat config + typescript-eslint strictTypeChecked, Prettier + `prettier-plugin-tailwindcss`, knip, husky/lint-staged — see the main standards doc), frontend-specific:

| Package | Purpose |
|---|---|
| `eslint-plugin-react-hooks` | rules-of-hooks + exhaustive-deps as **error** |
| `eslint-plugin-jsx-a11y` | static a11y lint |
| `@tanstack/eslint-plugin-query` | catches unstable query fns, bad key usage |
| `eslint-plugin-react-compiler` | if adopting React Compiler — flags code it can't optimize |
| `@next/bundle-analyzer` | run before releases; catches "imported the whole chart lib" regressions |
| `server-only` / `client-only` | build-time import boundary enforcement |
| `typescript-plugin-css-modules` | only if any CSS modules sneak in (prefer not) |
| `storybook` (optional) | worth it once `components/ui` + feature components exceed ~30; doubles as visual portfolio artifact |

**React Compiler note (2026):** stable and on by default in new Next.js setups — it auto-memoizes, so hand-written `useMemo`/`useCallback`/`React.memo` should be *removed* where the compiler covers them, not added by habit. Keep the compiler ESLint plugin on so you learn what patterns block optimization.

---

## 5. Testing the Frontend

Layered, in order of quantity:

1. **Unit (Vitest)** — pure logic: formatters, Zod transforms, query-key factories, date display helpers. Fast, hundreds of them.
2. **Component (Vitest + Testing Library + user-event)** — behavior, not implementation: "typing 99.99 and submitting calls the API with `amountMinor: 9999`". Query by role/label (doubles as an a11y check).
3. **Network layer (MSW)** — mock at the HTTP boundary, not by mocking `useQuery`. Your hooks, cache, and error handling run for real against declared handlers. Reuse the same MSW handlers in Vitest, Storybook, and Playwright.
4. **E2E (Playwright)** — only the money paths: add expense → appears in list → monthly total updates → survives reload; edit; delete with undo; month navigation; CSV import happy path. Run against a seeded test DB in CI.
5. **A11y**: `vitest-axe` in component tests + Playwright `@axe-core/playwright` on key pages. Automated axe catches ~30–40% of issues; keyboard-walk the app manually per release.

**What not to test:** shadcn primitives (Radix is tested upstream), Tailwind classes, TanStack Query internals.

---

## 6. Performance & Web Vitals

* **Budgets, enforced in CI:** LCP < 2.5s, INP < 200ms, CLS < 0.1. Use `@vercel/speed-insights`-style RUM or self-host `web-vitals` reporting into your observability stack (fits the GlitchTip/OTel setup).
* **Bundle discipline:** dynamic-import heavy widgets (`next/dynamic`) — charts and import wizard load on demand; dashboard shell stays light. Check `@next/bundle-analyzer` per release.
* **Images/fonts:** `next/image` and `next/font` (self-hosted variable font, e.g. Inter) — zero layout shift, no third-party font requests (nice for the self-hosted ethos).
* **Streaming:** wrap slow dashboard sections in `<Suspense>` with skeletons (shadcn `Skeleton`) so the shell paints instantly and charts stream in.
* **Optimistic updates:** adding an expense updates the list *immediately* via `onMutate` cache write, rolled back `onError` with a sonner toast. This is the single biggest perceived-performance win in a tracker app.
* **Prefetch on intent:** `prefetchQuery` for next/prev month on hover of the month navigator — month switching feels instant.

---

## 7. Frontend Folder Structure (feature-sliced, App Router)

```
apps/web/
├── app/                      # routes only — thin files that compose features
│   ├── (auth)/login/
│   ├── (dashboard)/
│   │   ├── layout.tsx        # shell: sidebar, header (server component)
│   │   ├── page.tsx          # overview dashboard
│   │   ├── transactions/
│   │   ├── budgets/
│   │   └── reports/
│   └── api/                  # only Next-specific routes (auth callbacks); business API = NestJS
├── components/
│   ├── ui/                   # shadcn primitives — never feature-edited
│   └── shared/               # Money, DateDisplay, EmptyState, PageHeader
├── features/                 # the real code, sliced by domain
│   ├── transactions/
│   │   ├── components/       # TransactionList, TxnForm, TxnRow
│   │   ├── hooks/            # useTransactions, useAddTransaction
│   │   ├── api.ts            # typed API client calls
│   │   └── schemas.ts        # re-exports from shared + client-only refinements
│   ├── budgets/
│   └── reports/
├── lib/                      # query-client factory, query-keys, api-client, utils
├── stores/                   # zustand stores (ui.store.ts)
└── styles/                   # globals.css with @theme tokens
```

Rules: routes import from `features/`; features never import from `app/`; features may import `components/` and `lib/`, never each other directly (go through `lib/` or shared schemas if needed). `madge --circular` enforces this stays true.

---

## 8. Frontend PR Checklist (append to the PR template for `web` scope)

- [ ] New interactive code is behind the smallest possible `"use client"` boundary
- [ ] Query keys come from the key factory; mutations invalidate the right families
- [ ] Shareable view state (month, filters) is in the URL, not a store
- [ ] Money rendered only via `<Money />`; no arithmetic on amounts client-side
- [ ] Loading (skeleton), empty, and error states designed — not just the happy path
- [ ] Keyboard reachable + labelled (axe passes; form has visible focus rings)
- [ ] Heavy components dynamically imported; bundle analyzer diff checked for large PRs
- [ ] No hand-written memoization the React Compiler already covers
