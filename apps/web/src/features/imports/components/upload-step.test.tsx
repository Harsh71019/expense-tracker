import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Account } from "@vyaya/shared";
import { describe, expect, it, vi } from "vitest";

import { UploadStep } from "./upload-step";

const account: Account = {
  id: "507f1f77bcf86cd799439011",
  userId: "u1",
  name: "HDFC Savings",
  type: "bank",
  currency: "INR",
  balanceMinor: 0,
  openingBalanceMinor: 0,
  isArchived: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

function fileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector("input[type=file]");
  if (!(input instanceof HTMLInputElement)) throw new Error("Expected a file input.");
  return input;
}

describe("UploadStep", () => {
  it("reports the selected account", async () => {
    const user = userEvent.setup();
    const onAccountChange = vi.fn();
    render(
      <UploadStep
        accounts={[account]}
        accountId=""
        onAccountChange={onAccountChange}
        file={undefined}
        onFileChange={vi.fn()}
      />
    );
    await user.selectOptions(screen.getByLabelText(/Which account/), account.id);
    expect(onAccountChange).toHaveBeenCalledWith(account.id);
  });

  it("accepts a valid CSV file", async () => {
    const user = userEvent.setup();
    const onFileChange = vi.fn();
    const { container } = render(
      <UploadStep
        accounts={[account]}
        accountId={account.id}
        onAccountChange={vi.fn()}
        file={undefined}
        onFileChange={onFileChange}
      />
    );
    const csv = new File(["Date,Amount"], "statement.csv", { type: "text/csv" });
    await user.upload(fileInput(container), csv);
    expect(onFileChange).toHaveBeenCalledWith(csv);
  });

  it("rejects a non-csv file with an inline error", () => {
    const onFileChange = vi.fn();
    const { container } = render(
      <UploadStep
        accounts={[account]}
        accountId={account.id}
        onAccountChange={vi.fn()}
        file={undefined}
        onFileChange={onFileChange}
      />
    );
    const pdf = new File(["not a csv"], "statement.pdf", { type: "application/pdf" });
    // userEvent.upload() honours the input's accept filter and silently drops
    // non-matching files, so fireEvent is used to exercise the rejection path.
    fireEvent.change(fileInput(container), { target: { files: [pdf] } });
    expect(onFileChange).toHaveBeenCalledWith(undefined);
    expect(screen.getByText("Wrong file type")).toBeVisible();
  });

  it("rejects a file over the 5 MB limit", async () => {
    const user = userEvent.setup();
    const onFileChange = vi.fn();
    const { container } = render(
      <UploadStep
        accounts={[account]}
        accountId={account.id}
        onAccountChange={vi.fn()}
        file={undefined}
        onFileChange={onFileChange}
      />
    );
    const big = new File([new Uint8Array(6 * 1024 * 1024)], "big.csv", { type: "text/csv" });
    await user.upload(fileInput(container), big);
    expect(onFileChange).toHaveBeenCalledWith(undefined);
    expect(screen.getByText("File too large")).toBeVisible();
  });

  it("shows the picked file and can clear it", async () => {
    const user = userEvent.setup();
    const onFileChange = vi.fn();
    const csv = new File(["Date,Amount"], "statement.csv", { type: "text/csv" });
    render(
      <UploadStep
        accounts={[account]}
        accountId={account.id}
        onAccountChange={vi.fn()}
        file={csv}
        onFileChange={onFileChange}
      />
    );
    expect(screen.getByText("statement.csv")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Remove file" }));
    expect(onFileChange).toHaveBeenCalledWith(undefined);
  });
});
