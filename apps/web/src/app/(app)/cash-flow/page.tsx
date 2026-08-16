import type { ReactNode } from "react";

import { CashflowForecastPage } from "@/features/cashflow-forecast/components/cashflow-forecast-page";
import { getCashflowForecasts } from "@/features/cashflow-forecast/server/get-cashflow-forecasts";

function selectedHorizon(value: string | string[] | undefined): 30 | 60 | 90 {
  const days = Array.isArray(value) ? value[0] : value;
  if (days === "60") return 60;
  if (days === "90") return 90;
  return 30;
}

export default async function CashflowForecastRoute({
  searchParams
}: Readonly<{ searchParams: Promise<{ days?: string | string[] }> }>): Promise<ReactNode> {
  const [forecasts, params] = await Promise.all([getCashflowForecasts(), searchParams]);
  return <CashflowForecastPage forecasts={forecasts} selectedDays={selectedHorizon(params.days)} />;
}
