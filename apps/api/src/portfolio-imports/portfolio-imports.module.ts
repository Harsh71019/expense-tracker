import { Module } from "@nestjs/common";

import { AssetsModule } from "../assets/assets.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { PortfolioImportBatchRepository } from "./portfolio-import-batch.repository.js";
import { PortfolioImportController } from "./portfolio-import.controller.js";
import { PortfolioImportEncryptionService } from "./portfolio-import-encryption.service.js";
import { PortfolioImportMatcherService } from "./portfolio-import-matcher.service.js";
import { PortfolioImportPayloadRepository } from "./portfolio-import-payload.repository.js";
import { PortfolioImportsQueue } from "./portfolio-import.queue.js";
import { PortfolioImportRowRepository } from "./portfolio-import-row.repository.js";
import { PortfolioImportService } from "./portfolio-import.service.js";
import { PortfolioImportSweeperService } from "./portfolio-import-sweeper.service.js";

@Module({
  imports: [AssetsModule, AuditModule],
  controllers: [PortfolioImportController],
  providers: [
    PortfolioImportBatchRepository,
    PortfolioImportPayloadRepository,
    PortfolioImportRowRepository,
    PortfolioImportEncryptionService,
    PortfolioImportMatcherService,
    PortfolioImportsQueue,
    PortfolioImportService,
    PortfolioImportSweeperService
  ],
  exports: [PortfolioImportService, PortfolioImportsQueue, PortfolioImportBatchRepository]
})
export class PortfolioImportsModule {}
