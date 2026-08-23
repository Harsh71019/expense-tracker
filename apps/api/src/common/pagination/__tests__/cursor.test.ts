import { describe, expect, it } from "vitest";
import { z } from "zod";

import { InvalidCursorError } from "../../errors/invalid-cursor.error.js";
import { decodeCursorPayload, decodeCursorPayloadOrNull, encodeCursorPayload } from "../cursor.js";

const DateIdSchema = z.object({ occurredAt: z.string().datetime(), id: z.string().uuid() });
const TupleSchema = z.tuple([z.number().int(), z.number().int(), z.string().uuid()]);

const ID = "11111111-1111-4111-8111-111111111111";
const OCCURRED_AT = new Date("2026-01-15T10:30:00.000Z");

describe("cursor codec", () => {
  it("round-trips an object payload used by ledger lists", () => {
    const encoded = encodeCursorPayload({ occurredAt: OCCURRED_AT.toISOString(), id: ID });
    expect(encoded).toBe(
      Buffer.from(
        JSON.stringify({ occurredAt: OCCURRED_AT.toISOString(), id: ID }),
        "utf8"
      ).toString("base64url")
    );
    const decoded = decodeCursorPayload(encoded, DateIdSchema);
    expect(decoded).toEqual({ occurredAt: OCCURRED_AT.toISOString(), id: ID });
  });

  it("round-trips a tuple payload used by review-inbox / safety-buffer", () => {
    const payload = [42, OCCURRED_AT.getTime(), ID] as const;
    const decoded = decodeCursorPayload(encodeCursorPayload(payload), TupleSchema);
    expect(decoded).toEqual([42, OCCURRED_AT.getTime(), ID]);
  });

  it("throws InvalidCursorError for malformed, non-JSON, and schema-mismatch cursors", () => {
    expect(() => decodeCursorPayload("not-base64-json", DateIdSchema)).toThrow(InvalidCursorError);
    expect(() =>
      decodeCursorPayload(encodeCursorPayload({ occurredAt: "yesterday", id: ID }), DateIdSchema)
    ).toThrow(InvalidCursorError);
    expect(() => decodeCursorPayload(encodeCursorPayload({ id: ID }), DateIdSchema)).toThrow(
      InvalidCursorError
    );
  });

  it("returns null instead of throwing when the caller opted into a soft decode", () => {
    expect(decodeCursorPayloadOrNull("%%%", DateIdSchema)).toBeNull();
    expect(decodeCursorPayloadOrNull(encodeCursorPayload({ id: ID }), DateIdSchema)).toBeNull();
    expect(
      decodeCursorPayloadOrNull(
        encodeCursorPayload({ occurredAt: OCCURRED_AT.toISOString(), id: ID }),
        DateIdSchema
      )
    ).toEqual({ occurredAt: OCCURRED_AT.toISOString(), id: ID });
  });
});
