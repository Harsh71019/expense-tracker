import { eq } from "drizzle-orm";

import { user } from "../../src/common/db/auth-schema.js";
import type { SeedServices } from "./context.js";

export type SeedUser = Readonly<{ id: string; email: string; password: string; name: string }>;

export const PRIMARY_USER: Omit<SeedUser, "id"> = {
  email: "demo@vyaya.local",
  password: "demo-password-12345",
  name: "Demo User"
};

/**
 * Light dataset (SEEDING-PLAN.md §3): exists purely so a developer can log
 * in as each user in turn and manually confirm tenant isolation — the same
 * property the integration suite already covers with "user-a"/"user-b"
 * fixtures, just now also checkable by hand in the running UI.
 */
export const SECONDARY_USER: Omit<SeedUser, "id"> = {
  email: "demo2@vyaya.local",
  password: "demo2-password-12345",
  name: "Demo User Two"
};

/** Returns the existing user's id if already signed up, otherwise signs up and returns the new id. */
export async function seedUser(
  services: SeedServices,
  spec: Omit<SeedUser, "id">
): Promise<SeedUser> {
  const [existing] = await services.db.select().from(user).where(eq(user.email, spec.email));
  if (existing !== undefined) {
    return { ...spec, id: existing.id };
  }

  const signUpResult = await services.auth.api.signUpEmail({
    body: { email: spec.email, password: spec.password, name: spec.name }
  });
  return { ...spec, id: signUpResult.user.id };
}
