import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ImportBatchStatus } from "./import-batch-status";

describe("ImportBatchStatus", () => {
  it("renders a label for every batch status", () => {
    render(
      <>
        <ImportBatchStatus status="pending" />
        <ImportBatchStatus status="pending_parse" />
        <ImportBatchStatus status="parsing" />
        <ImportBatchStatus status="staged" />
        <ImportBatchStatus status="commit_queued" />
        <ImportBatchStatus status="committing" />
        <ImportBatchStatus status="committed" />
        <ImportBatchStatus status="revert_queued" />
        <ImportBatchStatus status="reverting" />
        <ImportBatchStatus status="reverted" />
        <ImportBatchStatus status="failed" />
      </>
    );
    expect(screen.getByText("Pending")).toBeVisible();
    expect(screen.getByText("Parse queued")).toBeVisible();
    expect(screen.getByText("Parsing")).toBeVisible();
    expect(screen.getByText("Staged")).toBeVisible();
    expect(screen.getByText("Commit queued")).toBeVisible();
    expect(screen.getByText("Committing")).toBeVisible();
    expect(screen.getByText("Committed")).toBeVisible();
    expect(screen.getByText("Revert queued")).toBeVisible();
    expect(screen.getByText("Reverting")).toBeVisible();
    expect(screen.getByText("Reverted")).toBeVisible();
    expect(screen.getByText("Failed")).toBeVisible();
  });
});
