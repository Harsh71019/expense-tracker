import { FinancialDiagnosticSchema, type FinancialDiagnostic } from "@treasury-ops/shared";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";

/**
 * Initial authenticated server-side render fetcher for the financial readiness diagnostic.
 * A transport failure or schema mismatch fails closed to `null`.
 */
export const getFinancialDiagnostic = cache(
  async (asOf?: string): Promise<FinancialDiagnostic | null> => {
    try {
      const client = await getServerApiClient();
      const result = await client.GET("/v1/financial-profile/diagnostic", {
        params: {
          query: asOf ? { asOf } : {}
        }
      });
      const parsed = FinancialDiagnosticSchema.safeParse(result.data);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
);
