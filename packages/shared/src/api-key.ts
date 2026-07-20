import { z } from "zod";

export const ApiKeyPermissionsSchema = z
  .object({
    transactions: z.array(z.enum(["write"])).optional(),
    categories: z.array(z.enum(["read"])).optional(),
    accounts: z.array(z.enum(["read"])).optional()
  })
  .refine((value) => Object.keys(value).length > 0, "Select at least one scope.");

export const ApiKeyIdSchema = z.string().min(1);

export const CreateApiKeySchema = z.object({
  name: z.string().trim().min(1).max(80),
  permissions: ApiKeyPermissionsSchema,
  expiresAt: z.coerce.date().optional()
});

export const UpdateApiKeySchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  permissions: ApiKeyPermissionsSchema.optional()
});

export const ApiKeySchema = z.object({
  id: ApiKeyIdSchema,
  name: z.string(),
  start: z.string().nullable(),
  permissions: ApiKeyPermissionsSchema.nullable(),
  enabled: z.boolean(),
  createdAt: z.coerce.date(),
  expiresAt: z.coerce.date().nullable(),
  lastRequest: z.coerce.date().nullable()
});

export const CreateApiKeyResponseSchema = ApiKeySchema.extend({
  key: z.string()
});

export type ApiKeyPermissions = z.infer<typeof ApiKeyPermissionsSchema>;
export type ApiKeyId = z.infer<typeof ApiKeyIdSchema>;
export type CreateApiKey = z.infer<typeof CreateApiKeySchema>;
export type UpdateApiKey = z.infer<typeof UpdateApiKeySchema>;
export type ApiKey = z.infer<typeof ApiKeySchema>;
export type CreateApiKeyResponse = z.infer<typeof CreateApiKeyResponseSchema>;
