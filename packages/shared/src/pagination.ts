import { z } from "zod";

export const PageInfoSchema = z.object({
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
  limit: z.number().int().positive()
});

export type PageInfo = z.infer<typeof PageInfoSchema>;
