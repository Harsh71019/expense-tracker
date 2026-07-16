import { z } from "zod";

export const DateFormatSchema = z.enum(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]);

export type DateFormat = z.infer<typeof DateFormatSchema>;
