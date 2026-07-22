import { describe, expect, it } from "vitest";
import { Reflector } from "@nestjs/core";

import { RequireScopes, REQUIRE_SCOPES_KEY } from "../require-scopes.decorator.js";

describe("RequireScopes", () => {
  it("attaches the given scopes as route metadata under REQUIRE_SCOPES_KEY", () => {
    class Target {
      @RequireScopes({ transactions: ["write"] })
      handler(): void {
        return undefined;
      }
    }

    const reflector = new Reflector();
    const scopes = reflector.get(REQUIRE_SCOPES_KEY, new Target().handler);
    expect(scopes).toEqual({ transactions: ["write"] });
  });
});
