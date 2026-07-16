import { z } from "zod";

export const ExportCsvQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
});

export type ExportCsvQuery = z.infer<typeof ExportCsvQuerySchema>;
