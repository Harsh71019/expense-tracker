# TreasuryOps Frontend — Quality of Life (QoL) & Best Practices Gap Analysis

This document provides a detailed analysis of the user experience (UX), developer experience (DX), and standard design/architectural methods that are currently missing, incomplete, or deviate from standard practices in the **TreasuryOps** Next.js App Router frontend (`apps/web`).

---

## 1. Offline Mode, Service Workers, & PWA Incompleteness

The frontend architecture document (`docs/frontend/FRONTEND.md` §7) details a plan for an offline quick-add queue and sync mechanism. However, this is currently missing from the implementation.

### Missing QoL / Deviations:
*   **IndexedDB / LocalStorage Queue (`src/lib/offline`)**: The entire outbox queue (`queue.ts`) and drain-on-reconnect sync logic (`sync.ts`) are missing from the codebase.
*   **No Service Worker Registration**: There is no Service Worker (`sw.js` or `workbox` config) registered. Without this, the web application cannot load when the device is completely offline, failing the primary goal of *"quick-add on a moving Mumbai local train with zero connection."*
*   **Offline UI States & Banners**: The UI has no visual cues (e.g. offline status chip, connectivity warning banner) indicating whether the app is currently in offline capture mode or online mode.
*   **Reconnection Sync Feedback**: There is no feedback loop notifying the user when their offline queue is successfully synced to the backend once a connection is re-established.

---

## 2. Accessibility (a11y) & Keyboard Navigation

For a mobile-first expense ledger designed to be used "one-handed" or quickly, mouse/tap-reliance is a major bottleneck.

### Missing QoL / Deviations:
*   **No Global Keyboard Command Palette / Shortcuts**: Power users cannot navigate quickly. Standard shortcuts are missing:
    *   `cmd+k` or `ctrl+k` for a search/navigation palette.
    *   `/` to immediately focus search filters on list pages.
    *   `n` or `c` to open the "Quick Add" form from anywhere.
    *   `esc` to close active sheets, drawers, or dialogs.
*   **Keyboard Navigation within Lists**: The main ledger table and category lists are not fully accessible via keyboard (`Tab` index or arrow keys) to let users review and expand transaction rows without clicking.
*   **Aria-Live Announcements**: Actions like reversing a transaction, uploading a statement, or completing a sync do not announce success/error states to screen readers.

---

## 3. Interactive Data Visualization & Dashboard QoL

The reports module renders static/semi-interactive SVG charts, but leaves several interactive best practices unaddressed.

### Missing QoL / Deviations:
*   **No Drill-down Functionality**: Users cannot click on a chart slice (e.g., the "Food" category in a donut chart) to drill down into subcategories or automatically filter the transaction list page for that category.
*   **Touch-Friendly Tooltips**: Charts lack mobile-responsive hover/touch tooltips that display precise amounts or percentages on tap.
*   **No Time-Period Comparisons**: Dashboards lack easy QoL comparisons (e.g., "vs. Last Month" or percentage trends) on the main widgets.

---

## 4. Smart Inputs & Form UX

Form completion is the highest-friction part of any personal finance application.

### Missing QoL / Deviations:
*   **No Math Solver in Amount Inputs**: The `AmountInput` component uses a strict numeric regular expression. In standard accounting apps, users expect to do basic arithmetic inline (e.g., typing `120+45+60` should evaluate to `225` on blur/submit).
*   **Draft Form State Persistence**: If a user is filling out a complex transfer or manual transaction and navigates away or suffers a page reload, all input state is lost. There is no automatic caching of form drafts to `localStorage` or `sessionStorage`.
*   **Inline Autocomplete / Description Suggestions**: The application does not suggest matching descriptions (e.g. auto-suggesting "Grocery store" or "Auto Fare" based on past inputs) or automatically predict categories until after a rule-tester is triggered.

---

## 5. Perceived Latency & Optimistic UI Updates

For standard actions, TanStack Query is used, but it relies on invalidating queries and refetching from the API on mutation settlement.

### Missing QoL / Deviations:
*   **No Optimistic Mutations**: When a user clicks **"Reverse"** on a transaction or **"Archive"** on a category, the UI waits for the API response round-trip (which could take several seconds on flaky mobile networks) before updating.
*   *Best Practice*: Immediately update the client cache (e.g., add the reversed transaction row, update account balances, or remove the archived category), and roll back the UI only if the server returns an error.

---

## 6. Ledger Safety & Recovery UX

Because the backend enforces an append-only transaction ledger, errors cannot be corrected by editing or deleting a transaction. Instead, they require posting a compensating reversal.

### Missing QoL / Deviations:
*   **No "Undo" Action on Toast Notifications**: When a transaction is posted, the user receives a success toast. If they made a mistake, they must manually open the transaction details and click reverse.
*   *Best Practice*: Include an immediate **"Undo"** action on the success toast notification. Clicking "Undo" should automatically trigger the `useReverseTxn` mutation for the newly created transaction ID.

---

## 7. CSV Import Workflow QoL

The CSV import screen is a multi-step wizard, but it lacks bulk handling controls for larger files.

### Missing QoL / Deviations:
*   **No Bulk Actions on Staged Rows**: If an import statement contains 50 rows, the user must review and categorize them one by one. There are no bulk actions (e.g., selecting multiple rows to assign a category or toggling the "include" state for multiple rows).
*   **No Hot-Swap Uploads**: If the wrong CSV file is selected, the user cannot easily drop a new file onto the workspace to replace it without navigating back to the start of the wizard.
