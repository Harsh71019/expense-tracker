import { ImportBatchSchema, type ImportBatch } from "@vyaya/shared";
import { z } from "zod";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";
import { debug } from "@/lib/debug";

const ImportBatchesSchema = z.array(ImportBatchSchema);

export const getImportBatches = cache(async (): Promise<ImportBatch[]> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/imports");
    const parsed = ImportBatchesSchema.safeParse(result.data);
    if (!parsed.success) {
      debug.api("imports response failed validation", parsed.error.flatten());
      return [];
    }
    return parsed.data;
  } catch (error: unknown) {
    debug.api("imports request failed", error);
    return [];
  }
});
