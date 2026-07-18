import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import TransactionsLoading from "./loading";

describe("TransactionsLoading", () => {
  it("renders six transaction row placeholders", () => {
    const { container } = render(<TransactionsLoading />);

    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(18);
    expect(container.querySelectorAll(".border-b")).toHaveLength(6);
  });
});
