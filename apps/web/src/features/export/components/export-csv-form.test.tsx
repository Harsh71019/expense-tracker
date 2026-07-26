import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ExportCsvForm } from "./export-csv-form";

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  createObjectUrl: vi.fn(),
  revokeObjectUrl: vi.fn()
}));

vi.mock("../hooks/use-export-csv", () => ({
  useExportCsv: () => ({ mutateAsync: mocks.mutateAsync, isPending: false })
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError }
}));

describe("ExportCsvForm", () => {
  beforeEach(() => {
    mocks.mutateAsync.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
    mocks.createObjectUrl.mockReset();
    mocks.createObjectUrl.mockReturnValue("blob:export");
    mocks.revokeObjectUrl.mockReset();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: mocks.createObjectUrl
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: mocks.revokeObjectUrl
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  it("downloads the CSV and confirms completion", async () => {
    const user = userEvent.setup();
    mocks.mutateAsync.mockResolvedValue("date,amount\n2026-07-01,100.00");
    render(<ExportCsvForm />);

    await user.click(screen.getByRole("button", { name: "Download CSV" }));

    expect(mocks.mutateAsync).toHaveBeenCalledWith({});
    expect(mocks.toastSuccess).toHaveBeenCalledWith("CSV export downloaded");
    expect(await screen.findByText(/Export prepared/)).toBeVisible();
    expect(mocks.revokeObjectUrl).toHaveBeenCalledWith("blob:export");
  });

  it("reports an export failure inline and as a toast", async () => {
    const user = userEvent.setup();
    mocks.mutateAsync.mockRejectedValue(new Error("Export unavailable"));
    render(<ExportCsvForm />);

    await user.click(screen.getByRole("button", { name: "Download CSV" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Export unavailable");
    expect(mocks.toastError).toHaveBeenCalledWith("Export unavailable");
  });
});
