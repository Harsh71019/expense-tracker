import { Module } from "@nestjs/common";
import { CategoryController } from "./category.controller.js";
import { CategoryRepository } from "./category.repository.js";
import { CategoryService } from "./category.service.js";
import { CategoryDiagnosticReadService } from "./category-diagnostic-read.service.js";
import { CategoryMutationService } from "./category-mutation.service.js";

@Module({
  controllers: [CategoryController],
  providers: [
    CategoryRepository,
    CategoryService,
    CategoryMutationService,
    CategoryDiagnosticReadService
  ],
  exports: [CategoryRepository, CategoryDiagnosticReadService]
})
export class CategoriesModule {}
