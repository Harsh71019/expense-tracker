import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import CashflowForecastLoading from "./loading";

describe("CashflowForecastLoading", () => {
  it("labels the loading state for assistive technology", () => {
    render(<CashflowForecastLoading />);
    expect(screen.getByLabelText("Loading cash-flow forecast")).toBeVisible();
  });
});
