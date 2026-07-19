# Modern Next.js & React Best Practices (2026 Edition)

As React and Next.js scale into large enterprise codebases in 2026, the ecosystem has converged on a set of strict architectural boundaries, type-safety rules, and standardized libraries. This document analyzes the state-of-the-art practices required to keep a large codebase maintainable, highlighting what standard methods are expected today.

---

## 1. Architecture & Folder Structure

For large codebases, traditional "type-based" folder structures (e.g., all hooks in `/hooks`, all components in `/components`) lead to tight coupling and spaghetti code.

### The 2026 Standard: Feature-Sliced Design (FSD)
Code is organized by **domain** or **feature**. Each feature is a self-contained module exposing only what is necessary through a public `index.ts`.
*   **Structure:** `src/features/<feature-name>/{components, hooks, model, server, index.ts}`
*   **Encapsulation:** Features cannot import deeply from other features. They must use the public API (the `index.ts` file) of another feature.
*   *Note on our codebase: Vyaya successfully implements this feature-sliced design pattern.*

---

## 2. TypeScript: "Beyond Strict"

In 2026, `"strict": true` is just the baseline. To build resilient applications, large codebases enforce advanced compiler flags to catch edge-case bugs at compile time.

### Required `tsconfig.json` Rules:
*   `"noUncheckedIndexedAccess": true`: Forces you to handle `undefined` when accessing array indices or dynamic object properties. This eliminates a massive class of runtime errors.
*   `"exactOptionalPropertyTypes": true`: Prevents you from explicitly assigning `undefined` to a property marked as optional (e.g., `key?: string`).
*   `"noImplicitOverride": true`: Ensures subclasses explicitly use the `override` keyword when overriding base class methods.
*   `"noFallthroughCasesInSwitch": true`: Prevents accidental fallthrough in switch statements.

### Type Safety Anti-Patterns to Ban:
*   **The `any` Type:** Completely banned. Use `unknown` and perform runtime narrowing (e.g., `typeof`, `instanceof`, or Zod validation).
*   **Type Assertions (`as`)**: Banned, except for `as const` on literal objects/arrays.
*   **Non-Null Assertions (`!`):** Banned. Handle the `null`/`undefined` path explicitly.

---

## 3. The Standard Library Stack (2026)

The ecosystem has largely standardized around a few highly optimized libraries to solve common problems in large applications.

### State Management & Data Fetching
*   **Server State (API Data):** **TanStack Query** (React Query). It is the undisputed standard for managing caching, deduplication, optimistic updates, and background refetching.
*   **Client State (UI State):** **Zustand**. It has effectively replaced Redux for most modern apps due to its zero-boilerplate, hook-based API, and high performance. For atom-based fragmented state, **Jotai** is the standard alternative.
*   **Data Fetching Boundary:** Leverage **React Server Components (RSC)** to fetch data on the server, then pass that data as `initialData` into Client Components (often hydrating a TanStack Query cache) to completely eliminate client-side waterfall requests.

### Forms & Validation
*   **Form State:** **React Hook Form**. The standard for performant, uncontrolled form validation.
*   **Runtime Validation:** **Zod**. Because TypeScript types are erased at runtime, Zod is mandatory for parsing API boundaries, environment variables, and form inputs.

### UI & Styling
*   **Styling Engine:** **Tailwind CSS** (v4+). The standard for utility-first styling.
*   **Component Primitives:** **shadcn/ui** (built on Radix UI). Rather than installing a massive component library (like MUI or AntD), the modern approach is to copy/paste accessible, unstyled primitives into your codebase and style them with Tailwind. This gives you 100% ownership of your design system.

### Testing
*   **Unit & Integration:** **Vitest**. The standard replacement for Jest, offering native ESM support, out-of-the-box TypeScript, and significantly faster execution.
*   **End-to-End (E2E):** **Playwright**. Faster, more reliable, and better equipped for modern web apps than Cypress.

---

## 4. Performance & Observability

*   **Bundler:** **Turbopack** is the standard for Next.js, vastly reducing local dev server boot times and HMR (Hot Module Replacement) latency.
*   **Observability:** Implementing `instrumentation.ts` (using OpenTelemetry) to monitor Core Web Vitals, API latencies, and capture errors (via Sentry or GlitchTip) is a requirement for production readiness.
*   **Middleware Discipline:** Next.js `middleware.ts` runs on the edge for *every* request. Standard practice dictates keeping this file extremely lean (e.g., simple cookie checks or routing). Heavy DB calls or complex crypto here will degrade global app latency.
