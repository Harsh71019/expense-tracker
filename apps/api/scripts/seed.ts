import { createInterface } from "node:readline/promises";

import { eq } from "drizzle-orm";

import { user } from "../src/common/db/auth-schema.js";
import { seedFullAccounts, seedLightAccounts } from "./seed/accounts.js";
import { seedFullAssets } from "./seed/assets.js";
import { seedCategoryRules } from "./seed/category-rules.js";
import { seedFullCategories, seedLightCategories } from "./seed/categories.js";
import { createSeedContext } from "./seed/context.js";
import type { SeedContext, SeedServices } from "./seed/context.js";
import { seedImports } from "./seed/imports.js";
import { seedNotificationsAndDrift } from "./seed/notifications-and-drift.js";
import { seedRecurring } from "./seed/recurring.js";
import { resetUser } from "./seed/reset.js";
import { triggerCrons } from "./seed/trigger-crons.js";
import { seedFullTransactions, seedLightTransactions } from "./seed/transactions.js";
import { PRIMARY_USER, SECONDARY_USER, seedUser } from "./seed/users.js";
import type { SeedUser } from "./seed/users.js";

const RESET_FLAG = "--reset";

async function findExistingUserId(services: SeedServices, email: string): Promise<string | null> {
  const [existing] = await services.db.select().from(user).where(eq(user.email, email));
  return existing?.id ?? null;
}

async function seedPrimaryUser(services: SeedServices): Promise<void> {
  const primary = await seedUser(services, PRIMARY_USER);

  const accounts = await seedFullAccounts(services, primary.id);
  const categories = await seedFullCategories(services, primary.id);
  await seedCategoryRules(services, primary.id, categories);
  await seedFullTransactions(services, primary.id, accounts, categories);
  await seedRecurring(services, primary.id, accounts, categories);
  await seedFullAssets(services, primary.id);
  await seedImports(services, primary.id, accounts);
  await seedNotificationsAndDrift(services, primary.id, accounts, categories);

  printUserSummary(primary);
}

async function seedSecondaryUser(services: SeedServices): Promise<string> {
  const secondary = await seedUser(services, SECONDARY_USER);

  const accounts = await seedLightAccounts(services, secondary.id);
  const categories = await seedLightCategories(services, secondary.id);
  await seedLightTransactions(services, secondary.id, accounts, categories);

  printUserSummary(secondary);
  return secondary.id;
}

function printUserSummary(seedUserResult: SeedUser): void {
  console.log(`  ${seedUserResult.email} / ${seedUserResult.password} (id=${seedUserResult.id})`);
}

/**
 * This codebase deliberately runs `NODE_ENV=production` even for local dev
 * (see `.env.development.local`'s comment: "same image, different env" —
 * environments are distinguished by which DATABASE_URL/REDIS_URL you point
 * at, never by NODE_ENV branches in business code). That means NODE_ENV
 * can't be used as a "refuse to run in prod" guard here — it would always
 * be "production" and always refuse, defeating the flag's purpose. Staging
 * and production also share the same DB *name* and *host* shape per
 * env.example, differing only in credentials — so there's no reliable
 * structural signal to auto-detect "this is prod" from the connection
 * string either. An interactive confirmation, printing exactly which
 * host/database is about to be wiped, is the honest alternative.
 */
async function confirmReset(databaseUrl: string): Promise<void> {
  const url = new URL(databaseUrl);
  const target = `${url.hostname}${url.port ? `:${url.port}` : ""}${url.pathname}`;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      `${RESET_FLAG} will permanently delete both demo users and everything they own from ${target}.\n` +
        'Type "yes" to continue: '
    );
    if (answer.trim().toLowerCase() !== "yes") {
      throw new Error(`${RESET_FLAG} cancelled.`);
    }
  } finally {
    rl.close();
  }
}

async function run(context: SeedContext, reset: boolean): Promise<void> {
  const { services } = context;

  if (reset) {
    await confirmReset(services.config.env.DATABASE_URL);
    for (const email of [PRIMARY_USER.email, SECONDARY_USER.email]) {
      const existingId = await findExistingUserId(services, email);
      if (existingId !== null) {
        console.log(`Resetting existing user ${email} (id=${existingId})…`);
        await resetUser(services.db, existingId);
      }
    }
  } else {
    const existingId = await findExistingUserId(services, PRIMARY_USER.email);
    if (existingId !== null) {
      console.log(
        `Demo user ${PRIMARY_USER.email} already exists (id=${existingId}) — skipping seed. ` +
          `Pass ${RESET_FLAG} to wipe and reseed.`
      );
      return;
    }
  }

  console.log("Seeding primary user (full dataset)…");
  await seedPrimaryUser(services);

  console.log("Seeding secondary user (light dataset, for manual tenant-isolation checks)…");
  const secondaryUserId = await seedSecondaryUser(services);

  console.log("Triggering cron jobs against the seeded data…");
  const primaryUserId = await findExistingUserId(services, PRIMARY_USER.email);
  if (primaryUserId === null) throw new Error("seed: primary user vanished mid-run.");
  await triggerCrons(services, [primaryUserId, secondaryUserId]);

  console.log("\nDone. Log in with:");
  printUserSummary({ ...PRIMARY_USER, id: primaryUserId });
  printUserSummary({ ...SECONDARY_USER, id: secondaryUserId });
  console.log(
    "\nNote: import parsing and notification delivery run on the real worker container's " +
      "BullMQ queues — if any of those steps warned about a missing worker heartbeat, run " +
      "`docker compose up -d worker` and re-run this script (safe to re-run without --reset " +
      "once the primary user already exists, though it will just skip straight to that message)."
  );
}

async function main(): Promise<void> {
  const reset = process.argv.includes(RESET_FLAG);
  const context = await createSeedContext();
  try {
    await run(context, reset);
  } finally {
    await context.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
