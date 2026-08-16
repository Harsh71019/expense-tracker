import {
  DeclaredDebtPageSchema,
  ProtectionStateSchema,
  type DeclaredDebtPage,
  type ProtectionState
} from "@treasury-ops/shared";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";

export const DEBT_PAGE_SIZE = 50;

/**
 * Initial authenticated render of the protection answers. A failure or a schema
 * mismatch fails closed to `null`, which the panel renders as "we could not
 * load this" — never as "you are covered".
 */
export const getProtectionState = cache(async (): Promise<ProtectionState | null> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/financial-profile/protection");
    const parsed = ProtectionStateSchema.safeParse(result.data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
});

/** Active declared debts for the initial render. */
export const getDeclaredDebtPage = cache(
  async (limit: number = DEBT_PAGE_SIZE): Promise<DeclaredDebtPage | null> => {
    try {
      const client = await getServerApiClient();
      const result = await client.GET("/v1/financial-profile/debts", {
        params: { query: { limit, status: "active" } }
      });
      const parsed = DeclaredDebtPageSchema.safeParse(result.data);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
);
