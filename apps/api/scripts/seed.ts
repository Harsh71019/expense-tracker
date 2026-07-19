import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";

import { createAuth } from "../src/auth/auth.service.js";
import { AccountRepository } from "../src/accounts/account.repository.js";
import { AuditRepository } from "../src/audit/audit.repository.js";
import { CategoryRepository } from "../src/categories/category.repository.js";
import { RuntimeConfigService } from "../src/common/config/runtime-config.service.js";
import { withTxn } from "../src/common/db/db-txn.js";
import { RedisService } from "../src/common/redis/redis.service.js";
import { TransactionRepository } from "../src/transactions/transaction.repository.js";
import { TransactionService } from "../src/transactions/transaction.service.js";
import { UserProfileService } from "../src/user-profiles/user-profile.service.js";
import { UserProfileRepository } from "../src/user-profiles/user-profile.repository.js";
import * as authSchema from "../src/common/db/auth-schema.js";
import { user } from "../src/common/db/auth-schema.js";
import * as schema from "../src/common/db/schema/index.js";

const DEMO_EMAIL = "demo@vyaya.local";
const DEMO_PASSWORD = "demo-password-12345";

const DEFAULT_CATEGORIES: readonly { name: string; kind: "expense" | "income" }[] = [
  { name: "Groceries", kind: "expense" },
  { name: "Rent", kind: "expense" },
  { name: "Utilities", kind: "expense" },
  { name: "Dining Out", kind: "expense" },
  { name: "Transport", kind: "expense" },
  { name: "Salary", kind: "income" },
  { name: "Interest", kind: "income" }
];

const SEED_LOGGER = {
  log: () => undefined,
  warn: (payload: unknown, message?: string) => console.warn(message ?? "", payload),
  error: () => undefined
};

async function main(): Promise<void> {
  const config = new RuntimeConfigService();
  const pool = new Pool({ connectionString: config.env.DATABASE_URL });
  const db = drizzle(pool, { schema: { ...schema, ...authSchema } });
  const redis = new RedisService(config);

  const profiles = new UserProfileService(new UserProfileRepository(db));
  const auth = createAuth(db, config, redis, profiles, SEED_LOGGER);

  const [existing] = await db.select().from(user).where(eq(user.email, DEMO_EMAIL));
  if (existing !== undefined) {
    console.log(`Demo user ${DEMO_EMAIL} already exists (id=${existing.id}) — skipping seed.`);
    await redis.onModuleDestroy();
    await pool.end();
    return;
  }

  const signUpResult = await auth.api.signUpEmail({
    body: { email: DEMO_EMAIL, password: DEMO_PASSWORD, name: "Demo User" }
  });
  const userId = signUpResult.user.id;
  console.log(`Created demo user ${DEMO_EMAIL} (id=${userId}, password=${DEMO_PASSWORD})`);

  const categories = new CategoryRepository(db);
  const categoryRows = await Promise.all(
    DEFAULT_CATEGORIES.map((category) => categories.create(userId, category))
  );

  const accounts = new AccountRepository(db);
  const [bank, cash] = await withTxn(db, async (tx) => [
    await accounts.create(
      userId,
      { name: "HDFC Bank", type: "bank", openingBalanceMinor: 5_000_00 },
      tx
    ),
    await accounts.create(userId, { name: "Cash", type: "cash", openingBalanceMinor: 1_000_00 }, tx)
  ]);
  if (bank === undefined || cash === undefined) {
    throw new Error("Account seed insert did not return rows.");
  }

  const salary = categoryRows.find((row) => row.name === "Salary");
  const groceries = categoryRows.find((row) => row.name === "Groceries");
  const dining = categoryRows.find((row) => row.name === "Dining Out");

  // Routed through the real TransactionService (not a raw insert) so
  // balanceMinor stays correct automatically -- a raw insert would leave the
  // cached balance drifting from the ledger, which is exactly the bug class
  // balances.verify (Task 23) exists to catch, not something a seed script
  // should knowingly introduce.
  const now = new Date();
  const transactions = new TransactionService(
    db,
    accounts,
    categories,
    new TransactionRepository(db),
    new AuditRepository(db),
    SEED_LOGGER
  );

  await transactions.create(
    userId,
    {
      accountId: bank.id,
      categoryId: salary?.id,
      type: "income",
      amountMinor: 80_000_00,
      occurredAt: new Date(now.getFullYear(), now.getMonth(), 1),
      description: "Monthly salary",
      tags: []
    },
    undefined
  );
  await transactions.create(
    userId,
    {
      accountId: bank.id,
      categoryId: groceries?.id,
      type: "expense",
      amountMinor: 2_500_00,
      occurredAt: new Date(now.getFullYear(), now.getMonth(), 5),
      description: "BigBasket order",
      tags: ["groceries"]
    },
    undefined
  );
  await transactions.create(
    userId,
    {
      accountId: cash.id,
      categoryId: dining?.id,
      type: "expense",
      amountMinor: 600_00,
      occurredAt: new Date(now.getFullYear(), now.getMonth(), 10),
      description: "Dinner with friends",
      tags: []
    },
    undefined
  );

  console.log(`Seeded ${categoryRows.length} categories, 2 accounts, 3 transactions.`);
  await redis.onModuleDestroy();
  await pool.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
