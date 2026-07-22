import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Logger } from "nestjs-pino";

import { AccountRepository } from "../../src/accounts/account.repository.js";
import { AssetRepository } from "../../src/assets/asset.repository.js";
import { AssetService } from "../../src/assets/asset.service.js";
import { ValuationRepository } from "../../src/assets/valuation.repository.js";
import { AuditRepository } from "../../src/audit/audit.repository.js";
import { createAuth } from "../../src/auth/auth.service.js";
import type { VyayaAuth } from "../../src/auth/auth.service.js";
import { BalanceVerifyRepository } from "../../src/balances/balance-verify.repository.js";
import { BalanceVerifyService } from "../../src/balances/balance-verify.service.js";
import { CategoryRepository } from "../../src/categories/category.repository.js";
import { CategoryRuleRepository } from "../../src/category-rules/category-rule.repository.js";
import { CategoryRuleService } from "../../src/category-rules/category-rule.service.js";
import * as authSchema from "../../src/common/db/auth-schema.js";
import type { DrizzleDb } from "../../src/common/db/db.module.js";
import * as schema from "../../src/common/db/schema/index.js";
import { RuntimeConfigService } from "../../src/common/config/runtime-config.service.js";
import { RedisService } from "../../src/common/redis/redis.service.js";
import { ImportBatchRepository } from "../../src/imports/import-batch.repository.js";
import { ImportsQueue } from "../../src/imports/imports.queue.js";
import { ImportsService } from "../../src/imports/imports.service.js";
import { StagedRowRepository } from "../../src/imports/staged-row.repository.js";
import { StagedRowsCleanupCron } from "../../src/imports/staged-rows-cleanup.cron.js";
import { NotificationOutboxRepository } from "../../src/notifications/notification-outbox.repository.js";
import { NotificationsQueue } from "../../src/notifications/notifications.queue.js";
import { NotificationSweepService } from "../../src/notifications/notification-sweep.service.js";
import { MonthlyRollupRepository } from "../../src/reports/monthly-rollup.repository.js";
import { RollupsRefreshService } from "../../src/reports/rollups-refresh.service.js";
import { RecurringMaterializeService } from "../../src/recurring/recurring-materialize.service.js";
import { RecurringRuleRepository } from "../../src/recurring/recurring-rule.repository.js";
import { RecurringRuleService } from "../../src/recurring/recurring-rule.service.js";
import { TransactionRepository } from "../../src/transactions/transaction.repository.js";
import { TransactionService } from "../../src/transactions/transaction.service.js";
import { TransferService } from "../../src/transactions/transfer.service.js";
import { UserProfileRepository } from "../../src/user-profiles/user-profile.repository.js";
import { UserProfileService } from "../../src/user-profiles/user-profile.service.js";

export type SeedServices = Readonly<{
  db: DrizzleDb;
  config: RuntimeConfigService;
  redis: RedisService;
  auth: VyayaAuth;
  accounts: AccountRepository;
  categories: CategoryRepository;
  categoryRules: CategoryRuleService;
  transactions: TransactionService;
  transactionsRepo: TransactionRepository;
  transfers: TransferService;
  recurring: RecurringRuleService;
  assets: AssetService;
  imports: ImportsService;
  importBatches: ImportBatchRepository;
  audit: AuditRepository;
  notificationOutbox: NotificationOutboxRepository;
  monthlyRollups: MonthlyRollupRepository;
  crons: {
    recurringMaterialize: RecurringMaterializeService;
    rollupsRefresh: RollupsRefreshService;
    balanceVerify: BalanceVerifyService;
    notificationSweep: NotificationSweepService;
    stagedRowsCleanup: StagedRowsCleanupCron;
  };
}>;

export type SeedContext = Readonly<{
  services: SeedServices;
  close: () => Promise<void>;
}>;

/**
 * Every log call this script's services can make, satisfied by one plain
 * console-backed object — the same "hand-rolled logger" shape the old
 * single-file seed.ts already used (SEED_LOGGER), just widened to cover
 * every service's `Pick<Logger, ...>` constructor parameter, not just
 * TransactionService's.
 */
const seedLogger: Pick<Logger, "log" | "warn" | "error"> = {
  log: (payload: unknown, message?: string) => console.log(message ?? "", payload),
  warn: (payload: unknown, message?: string) => console.warn(message ?? "", payload),
  error: (payload: unknown, message?: string) => console.error(message ?? "", payload)
};

/**
 * Manually wires every service this seed script needs, instead of booting
 * the real AppModule through Nest's DI container. This is *not* the
 * originally-planned approach (SEEDING-PLAN.md §4a assumed
 * `NestFactory.createApplicationContext`, mirroring worker.ts) — that
 * turned out to be non-viable: `tsx` transforms TypeScript via esbuild,
 * which — like vitest's default transform (see the comment in
 * vitest.integration.config.ts) — does not implement
 * `emitDecoratorMetadata`, so any constructor parameter without an explicit
 * `@Inject()` token resolves to `undefined` at runtime and Nest's injector
 * throws `UndefinedDependencyException`. `worker.ts`/`main.ts` never hit
 * this because they only ever run from `dist/*.js` (real `tsc` output, via
 * plain `node`), never through `tsx` directly. Manual construction is
 * exactly what the original seed.ts already did (for a smaller service
 * set) for this same reason — this just extends that pattern to every
 * service the comprehensive seed needs, in the same dependency order Nest
 * would resolve them in.
 */
export async function createSeedContext(): Promise<SeedContext> {
  process.env.SERVICE_ROLE = "worker";
  const config = new RuntimeConfigService();
  const pool = new Pool({ connectionString: config.env.DATABASE_URL, max: 10 });
  const db: DrizzleDb = drizzle(pool, { schema: { ...schema, ...authSchema } });
  const redis = new RedisService(config);

  const accounts = new AccountRepository(db);
  const categories = new CategoryRepository(db);
  const categoryRulesRepo = new CategoryRuleRepository(db);
  const transactionsRepo = new TransactionRepository(db);
  const audit = new AuditRepository(db);
  const assetsRepo = new AssetRepository(db);
  const valuations = new ValuationRepository(db);
  const importBatches = new ImportBatchRepository(db);
  const stagedRows = new StagedRowRepository(db);
  const notificationOutbox = new NotificationOutboxRepository(db);
  const monthlyRollups = new MonthlyRollupRepository(db);
  const balanceVerifyRepo = new BalanceVerifyRepository(db);
  const recurringRuleRepo = new RecurringRuleRepository(db);
  const userProfileRepo = new UserProfileRepository(db);

  const userProfiles = new UserProfileService(userProfileRepo);
  const auth = createAuth(db, config, redis, userProfiles, seedLogger);

  const categoryRules = new CategoryRuleService(categoryRulesRepo, categories);
  const transactions = new TransactionService(
    db,
    accounts,
    categories,
    transactionsRepo,
    audit,
    seedLogger
  );
  const transfers = new TransferService(db, accounts, transactionsRepo, audit, seedLogger);
  const recurring = new RecurringRuleService(db, recurringRuleRepo, accounts, categories);
  const assets = new AssetService(db, assetsRepo, valuations, audit);

  const importsQueue = new ImportsQueue(config);
  const imports = new ImportsService(
    db,
    importBatches,
    stagedRows,
    transactionsRepo,
    accounts,
    audit,
    categoryRulesRepo,
    importsQueue
  );

  const notificationsQueue = new NotificationsQueue(config);
  const notificationSweep = new NotificationSweepService(
    config,
    notificationOutbox,
    notificationsQueue,
    seedLogger
  );
  const recurringMaterialize = new RecurringMaterializeService(
    db,
    config,
    recurringRuleRepo,
    accounts,
    transactionsRepo,
    audit,
    seedLogger
  );
  const rollupsRefresh = new RollupsRefreshService(config, monthlyRollups, seedLogger);
  const balanceVerify = new BalanceVerifyService(
    db,
    config,
    balanceVerifyRepo,
    notificationOutbox,
    seedLogger
  );
  const stagedRowsCleanup = new StagedRowsCleanupCron(db, config, seedLogger);

  const services: SeedServices = {
    db,
    config,
    redis,
    auth,
    accounts,
    categories,
    categoryRules,
    transactions,
    transactionsRepo,
    transfers,
    recurring,
    assets,
    imports,
    importBatches,
    audit,
    notificationOutbox,
    monthlyRollups,
    crons: {
      recurringMaterialize,
      rollupsRefresh,
      balanceVerify,
      notificationSweep,
      stagedRowsCleanup
    }
  };

  return {
    services,
    close: async () => {
      await importsQueue.onModuleDestroy();
      await notificationsQueue.onModuleDestroy();
      await redis.onModuleDestroy();
      await pool.end();
    }
  };
}
