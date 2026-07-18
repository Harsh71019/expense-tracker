import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FileDropZone } from "../file-drop-zone";

describe("FileDropZone", () => {
  it("accepts a selected CSV file and shows its name", () => {
    const select = vi.fn();
    const { container } = render(
      <FileDropZone accept=".csv" onFileSelected={select} selectedFileName="statement.csv" />
    );
    const input = container.querySelector("input[type=file]");
    if (input === null) throw new Error("Expected a file input.");
    fireEvent.change(input, {
      target: { files: [new File(["Date"], "statement.csv", { type: "text/csv" })] }
    });
    expect(select).toHaveBeenCalledWith(expect.objectContaining({ name: "statement.csv" }));
    expect(screen.getByText("statement.csv")).toBeVisible();
  });

  it("handles drag state and a dropped file", () => {
    const select = vi.fn();
    render(<FileDropZone accept=".csv" onFileSelected={select} />);
    const trigger = screen.getByText("Drop a CSV here, or choose a file");
    const label = trigger.parentElement;
    if (label === null) throw new Error("Expected a drop-zone label.");
    fireEvent.dragEnter(trigger);
    expect(label).toHaveClass("border-accent");
    fireEvent.dragLeave(trigger);
    expect(label).toHaveClass("border-border");
    const file = new File(["Date"], "dropped.csv", { type: "text/csv" });
    fireEvent.drop(trigger, { dataTransfer: { files: { 0: file } } });
    expect(select).toHaveBeenCalledWith(file);
  });
});
