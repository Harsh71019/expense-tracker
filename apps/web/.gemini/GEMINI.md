# Gemini Frontend Development Rules

This file provides rules and instructions for Gemini (Antigravity) when working within the `apps/web` package of the TreasuryOps monorepo. 

> [!IMPORTANT]
> **Read the root `/AGENTS.md` and `/CLAUDE.md` first.** All global repository rules (such as TypeScript strictness, money-handling invariants, and testing gates) apply here.

---

## 1. Web App Tech Stack & Design Aesthetics
Adhere strictly to the following stack and design choices:
*   **Next.js App Router**: Use Next.js App Router features (SSR, RSC by default).
*   **Tailwind CSS**: Use Tailwind CSS for styling. Do not introduce new UI dependencies without asking.
*   **Rich Aesthetics**: Ensure clean, premium, modern design, using curated color palettes (no raw primary red/blue/green), smooth gradients, modern typography (Inter/Outfit), and subtle micro-animations/hover transitions. No generic MVPs.
*   **Semantic HTML & Accessibility (a11y)**: Follow a11y best practices (use `<dialog>` for modals, correct ARIA attributes, proper focus/keyboard navigation).

---

## 2. Strict Type Safety (No Escape Hatches)
We enforce `"strict": true` across TS configs. The typecheck step must pass with **zero errors**.
*   **No `any`**: Explicit or implicit `any` is banned. Use `unknown` with runtime type narrowing or write real types.
*   **No `as` casts**: Banned except for `as const` and casting `unknown` after an explicit runtime validation check.
*   **No `!` (non-null assertions)**: Handle the nullable paths or restructure your components/functions.
*   **No `enum`**: Use `as const` objects with union types instead.
*   **No `@ts-ignore` or `@ts-expect-error`**: Do not bypass compilers.

---

## 3. Frontend Architecture & Boundaries

### Rendering & Data Flow
*   **Server Components by Default**: Use Server Components (RSC) unless interactivity requires Client Components (`"use client"`).
*   **Folder Split**:
    *   `src/features/<name>/server/*.ts`: Server-only data fetchers wrapped in React's `cache()`, calling the server API client. Used for initial SSR rendering/hydration.
    *   `src/features/<name>/hooks/*.ts`: Client-side TanStack Query hooks, calling the browser API client. Always pass server-rendered data as `initialData` to prevent waterfalls.
    *   `src/features/<name>/components/*.tsx`: Presentation components.
    *   `src/features/<name>/model/*.ts`: Pure helper functions (Zod-backed parsing/serialization of URL search params, form-adjacent transforms). Absolutely no I/O.
    *   `src/features/<name>/index.ts`: The feature's public API surface. Import only from this index file when referencing the feature across package boundaries.

### API Clients
*   **Browser API Client**: `src/lib/api/client.ts` (`baseUrl: "/api"` rewriting to `INTERNAL_API_URL`).
*   **Server API Client**: `src/lib/api/server.ts` (directly hits `INTERNAL_API_URL`, forwards cookies and request IDs).
*   **Generated Client**: Do not hand-write raw `fetch` calls to the backend. Always use the generated `openapi-fetch` clients generated from the API's OpenAPI schema (`apps/web/src/lib/api/generated/schema.d.ts`).
*   **Zod Boundaries**: Response payloads must still be runtime-validated using the matching Zod schema from `@treasury-ops/shared`.

### Authentication
*   **Session Management**: Middleware (`src/proxy.ts`) does optimistic redirects. True, authoritative session check is done server-side in `(app)/layout.tsx` via `getSession()` (`src/lib/api/session.ts`).
*   **Client SDK**: Use `src/lib/auth/client.ts` wrapping Better Auth for sign-in/sign-out.

### Mutations & Idempotency
*   **Idempotency Keys**: Mutation hooks (e.g. `useCreateTxn`) must include an `Idempotency-Key` header generated on mount (use UUID). This prevents duplicate writes from double-submits.
*   **Query Invalidation**: On mutation success, invalidate relevant TanStack Query keys using query keys imported from `src/lib/query/keys.ts` (`qk`). Do not write ad hoc key arrays.

---

## 4. Money & Styling Rules
*   **Integer Paise**: Never format `amountMinor` (minor unit, paise) by dividing by 100 inline. Always use `<Money>` or `<SignedMoney>` from `src/components/ui/money`, or the `formatMinor()` utility from `@treasury-ops/shared`.
*   **Theme & Accents**: Backed by cookies (`treasury-ops-theme`, `treasury-ops-accent`). Read server-side to set `data-theme` and custom CSS variables before hydration. Do not use client-side flash-of-unstyled-theme hacks. Keep semantic color classes (income, expense, charts) independent from accent configurations.

---

## 5. Errors & Debugging
*   **Error Handling**: Parse API errors via `toAppError` / `toNetworkError` in `src/lib/api/problem.ts` which maps RFC 7807 problem+json to typed errors (e.g., `AuthError`, `ValidationError`). 
*   **Debug Logs**: Only use namespaced debug loggers from `src/lib/debug.ts`. Raw `console.log` is banned.
*   **Sensitive Data**: Scrub sensitive keys (`amountMinor`, `description`, `password`) in `src/lib/sentry-scrub.ts` before sending telemetry.

---

## 6. Definition of Done
Your task is done only when:
1.  `pnpm --filter @treasury-ops/web typecheck` passes with zero errors.
2.  `pnpm --filter @treasury-ops/web lint` passes with zero warnings.
3.  `pnpm --filter @treasury-ops/web test` passes.
4.  If mutation/layout logic is updated, verify with corresponding Playwright test where possible (`pnpm --filter @treasury-ops/web test:e2e`).
