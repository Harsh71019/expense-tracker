import {
  FinancialProfileStateSchema,
  SalaryStatisticsSchema,
  SalaryVersionPageSchema,
  type FinancialProfileState,
  type SalaryStatistics,
  type SalaryVersionPage
} from "@treasury-ops/shared";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";

export const SALARY_HISTORY_PAGE_SIZE = 20;

/**
 * Initial authenticated render of the salary and work profile. A failure or a
 * schema mismatch fails closed to `null` so the panel shows its setup state
 * rather than a half-trusted salary.
 */
export const getFinancialProfileState = cache(async (): Promise<FinancialProfileState | null> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/financial-profile");
    const parsed = FinancialProfileStateSchema.safeParse(result.data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
});

/**
 * Server-authoritative statistics. `null` covers both "not set up yet" (the
 * API answers 422) and any transport failure — the panel distinguishes the
 * two from the profile state, never by recomputing a salary itself.
 */
export const getSalaryStatistics = cache(async (): Promise<SalaryStatistics | null> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/financial-profile/salary-statistics", {
      params: { query: {} }
    });
    const parsed = SalaryStatisticsSchema.safeParse(result.data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
});

export const getSalaryVersionPage = cache(
  async (limit: number = SALARY_HISTORY_PAGE_SIZE): Promise<SalaryVersionPage | null> => {
    try {
      const client = await getServerApiClient();
      const result = await client.GET("/v1/financial-profile/salary-versions", {
        params: { query: { limit } }
      });
      const parsed = SalaryVersionPageSchema.safeParse(result.data);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
);
