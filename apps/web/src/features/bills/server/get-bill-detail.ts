import { BillDetailSchema, CreditCardBillIdSchema, type BillDetail } from "@treasury-ops/shared";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";
import { debug } from "@/lib/debug";

export const getBillDetail = cache(async (untrustedBillId: string): Promise<BillDetail | null> => {
  const parsedId = CreditCardBillIdSchema.safeParse(untrustedBillId);
  if (!parsedId.success) return null;

  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/bills/{billId}", {
      params: { path: { billId: parsedId.data } }
    });
    if (result.error !== undefined) return null;
    const parsed = BillDetailSchema.safeParse(result.data);
    if (!parsed.success) {
      debug.api("bill detail response failed validation", parsed.error.flatten());
      return null;
    }
    return parsed.data;
  } catch (error: unknown) {
    debug.api("bill detail request failed", error);
    return null;
  }
});
