import { z } from "zod";

import { ErrorCodes } from "./codes.js";

export const ProblemFieldErrorSchema = z.object({
  path: z.string(),
  code: z.string(),
  message: z.string()
});

export const ProblemDetailsSchema = z.object({
  type: z.string().url(),
  title: z.string(),
  status: z.number().int().positive(),
  detail: z.string(),
  instance: z.string(),
  code: z.enum(ErrorCodes),
  reqId: z.string(),
  timestamp: z.coerce.date(),
  retryable: z.boolean(),
  errors: z.array(ProblemFieldErrorSchema).nullable()
});

export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;
export type ProblemFieldError = z.infer<typeof ProblemFieldErrorSchema>;
