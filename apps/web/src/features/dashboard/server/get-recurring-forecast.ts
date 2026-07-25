import {
  RecurringForecastSchema,
  type RecurringForecast,
  type DashboardRange
} from "@treasury-ops/shared";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";

function empty(range: DashboardRange): RecurringForecast {
  return { range, inMinor: 0, outMinor: 0, netMinor: 0, upcoming: [] };
}

export const getRecurringForecast = cache(
  async (range: DashboardRange): Promise<RecurringForecast> => {
    try {
      const client = await getServerApiClient();
      const result = await client.GET("/v1/dashboard/recurring-forecast", {
        params: { query: { range } }
      });
      const parsed = RecurringForecastSchema.safeParse(result.data);
      return parsed.success ? parsed.data : empty(range);
    } catch {
      return empty(range);
    }
  }
);
