import { z } from "zod";

import { TransactionFiltersSchema } from "./transaction.js";

export const ExportCsvQuerySchema = TransactionFiltersSchema;

export type ExportCsvQuery = z.infer<typeof ExportCsvQuerySchema>;
