import {
  CashflowForecastSnapshotSchema,
  type CashflowForecastSnapshot
} from "@treasury-ops/shared";
import { cache } from "react";

import { toAppError } from "@/lib/api/problem";
import { getServerApiClient } from "@/lib/api/server";

export type CashflowForecasts = Readonly<{
  thirtyDay: CashflowForecastSnapshot | null;
  sixtyDay: CashflowForecastSnapshot | null;
  ninetyDay: CashflowForecastSnapshot | null;
}>;

async function getForecast(days: 30 | 60 | 90): Promise<CashflowForecastSnapshot | null> {
  const client = await getServerApiClient();
  const result = await client.GET("/v1/insights/cash-flow-forecast", {
    params: { query: { days } }
  });
  if (result.error !== undefined) {
    throw toAppError(result.error, result.response.status);
  }
  if (result.data === null || result.data === undefined) {
    return null;
  }
  const parsed = CashflowForecastSnapshotSchema.safeParse(result.data);
  if (!parsed.success) {
    throw new Error(`Invalid ${days}-day cash-flow forecast response.`);
  }
  return parsed.data;
}

export const getCashflowForecasts = cache(async (): Promise<CashflowForecasts> => {
  const [thirtyDay, sixtyDay, ninetyDay] = await Promise.all([
    getForecast(30),
    getForecast(60),
    getForecast(90)
  ]);
  return { thirtyDay, sixtyDay, ninetyDay };
});
