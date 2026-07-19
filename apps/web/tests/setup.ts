import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { vi } from "vitest";

// Next resolves this marker to an empty module in a React Server Component
// build. Unit tests run in jsdom, so provide the equivalent test boundary.
vi.mock("server-only", () => ({}));

// Keep DOM state isolated between component tests. This mirrors a fresh browser
// render and prevents attributes, focus, or rendered nodes leaking to a later test.
afterEach(() => {
  cleanup();
});
