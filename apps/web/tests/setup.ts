import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Keep DOM state isolated between component tests. This mirrors a fresh browser
// render and prevents attributes, focus, or rendered nodes leaking to a later test.
afterEach(() => {
  cleanup();
});
