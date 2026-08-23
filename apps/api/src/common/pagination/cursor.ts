import { z } from "zod";

import { InvalidCursorError } from "../errors/invalid-cursor.error.js";

/**
 * Opaque list-pagination cursors are JSON payloads, UTF-8, then base64url.
 * Per-repository schemas own the payload shape so existing client-held
 * cursors keep decoding; this helper only owns the codec.
 */
export function encodeCursorPayload(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeCursorPayload<T>(cursor: string, schema: z.ZodType<T>): T {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    return schema.parse(parsed);
  } catch {
    throw new InvalidCursorError();
  }
}

export function decodeCursorPayloadOrNull<T>(cursor: string, schema: z.ZodType<T>): T | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    const result = schema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
