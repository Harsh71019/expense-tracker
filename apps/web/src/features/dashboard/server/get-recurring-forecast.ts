import {
  RecurringForecastSchema,
  type RecurringForecast,
  type DashboardRange
} from "@treasury-ops/shared";
import { cache } from "react";

import { debug } from "@/lib/debug";
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
      if (!parsed.success) {
        debug.api(
          "dashboard recurring-forecast response failed validation",
          parsed.error.flatten()
        );
        return empty(range);
      }
      return parsed.data;
    } catch (error: unknown) {
      debug.api("dashboard recurring-forecast request failed", error);
      return empty(range);
    }
  }
);
