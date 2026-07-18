import { z } from "zod";

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

/**
 * Accepts either a Postgres uuid or a legacy Mongo ObjectId hex string.
 * TEMPORARY, for the mongo->postgres migration only (see
 * Plans/2026-07-18-postgres-migration.md): every entity id schema in this
 * package uses this while repositories are ported to Postgres one at a
 * time (that plan's Tasks 9-23), so an id produced by an already-ported
 * (uuid) repository and an id produced by a not-yet-ported (ObjectId)
 * repository both validate during the transition. Narrowed back to
 * `z.string().uuid()` once every repository generates real Postgres ids
 * (removed as part of that plan's Task 24, once Mongo is retired).
 */
export function migratingIdSchema(): z.ZodType<string> {
  return z.union([z.string().uuid(), z.string().regex(OBJECT_ID_PATTERN)]);
}
