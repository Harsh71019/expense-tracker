import type { TransactionTextPaymentRail } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";

const PAYMENT_RAIL_LABEL: Record<Exclude<TransactionTextPaymentRail, "unknown">, string> = {
  upi: "UPI",
  neft: "NEFT",
  rtgs: "RTGS",
  imps: "IMPS",
  nach: "NACH",
  card: "Card"
};

export function paymentRailLabel(rail: TransactionTextPaymentRail): string | null {
  return rail === "unknown" ? null : PAYMENT_RAIL_LABEL[rail];
}

export function PaymentRailBadge({
  rail
}: Readonly<{ rail: TransactionTextPaymentRail }>): ReactNode {
  const label = paymentRailLabel(rail);
  return label === null ? null : <Badge variant="info">{label}</Badge>;
}
