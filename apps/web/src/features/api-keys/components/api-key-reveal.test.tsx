import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ApiKeyReveal } from "./api-key-reveal";

describe("ApiKeyReveal", () => {
  it("shows the raw key, copies it, and dismisses", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText }
    });

    render(<ApiKeyReveal apiKey="ak_verysecret123" onDismiss={onDismiss} />);

    expect(screen.getByText("ak_verysecret123")).toBeVisible();
    expect(screen.getByText(/won't be shown again/i)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith("ak_verysecret123");

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onDismiss).toHaveBeenCalled();
  });
});
