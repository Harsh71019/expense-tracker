import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { MaskedValue } from "./masked-value";

describe("MaskedValue", () => {
  it("hides the value until View is clicked, then hides it again on toggle", async () => {
    const user = userEvent.setup();
    render(<MaskedValue value="ak_verysecret123" ariaLabel="API key" />);

    expect(screen.queryByText("ak_verysecret123")).not.toBeInTheDocument();

    const viewButton = screen.getByRole("button", { name: "View API key" });
    expect(viewButton).toHaveClass("min-h-11");
    await user.click(viewButton);
    expect(screen.getByText("ak_verysecret123")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Hide API key" }));
    expect(screen.queryByText("ak_verysecret123")).not.toBeInTheDocument();
  });
});
