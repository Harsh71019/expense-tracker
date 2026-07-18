import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ImportBatchStatus } from "./import-batch-status";

describe("ImportBatchStatus", () => {
  it("renders a label for every batch status", () => {
    render(
      <>
        <ImportBatchStatus status="pending" />
        <ImportBatchStatus status="staged" />
        <ImportBatchStatus status="committed" />
        <ImportBatchStatus status="reverted" />
        <ImportBatchStatus status="failed" />
      </>
    );
    expect(screen.getByText("Pending")).toBeVisible();
    expect(screen.getByText("Staged")).toBeVisible();
    expect(screen.getByText("Committed")).toBeVisible();
    expect(screen.getByText("Reverted")).toBeVisible();
    expect(screen.getByText("Failed")).toBeVisible();
  });
});
