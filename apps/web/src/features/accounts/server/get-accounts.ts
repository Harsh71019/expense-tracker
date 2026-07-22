import { AccountSchema, type Account } from "@treasury-ops/shared";
import { cache } from "react";
import { z } from "zod";

import { getServerApiClient } from "@/lib/api/server";

const AccountsSchema = z.array(AccountSchema);

export const getAccounts = cache(async (): Promise<Account[]> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/accounts");
    const parsed = AccountsSchema.safeParse(result.data);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
});
