import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "../../auth/auth.guard.js";
import { CategoryRecommendationController } from "../category-recommendation.controller.js";

const user: AuthenticatedUser = { id: "user-1" };
const occurredAt = "2026-08-22T06:30:00.000Z";

describe("CategoryRecommendationController", () => {
  it("parses a UTC body once and queries recommendations for the session user", async () => {
    const recommendForPicker = vi.fn().mockResolvedValue({
      items: [],
      computedAt: new Date(occurredAt),
      sourceThrough: null,
      algorithmVersion: 2,
      historyRowsConsidered: 0,
      degraded: false
    });
    const controller = new CategoryRecommendationController(
      // @ts-expect-error - mock CategorySuggestionService for unit testing
      { recommendForPicker }
    );
    const response = { setHeader: vi.fn() };

    await controller.query(
      user,
      { type: "expense", occurredAt, description: "SWIGGY" },
      // @ts-expect-error - mock Express response for unit testing
      response
    );

    expect(recommendForPicker).toHaveBeenCalledWith("user-1", {
      type: "expense",
      occurredAt: new Date(occurredAt),
      limit: 5,
      description: "SWIGGY"
    });
    expect(response.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
  });

  it("rejects date-only occurredAt and extra userId before calling the service", async () => {
    const recommendForPicker = vi.fn();
    const controller = new CategoryRecommendationController(
      // @ts-expect-error - mock CategorySuggestionService for unit testing
      { recommendForPicker }
    );

    expect(() => controller.query(user, { type: "expense", occurredAt: "2026-08-22" })).toThrow();
    expect(() =>
      controller.query(user, {
        type: "expense",
        occurredAt,
        userId: "other-user"
      })
    ).toThrow();
    expect(recommendForPicker).not.toHaveBeenCalled();
  });
});
