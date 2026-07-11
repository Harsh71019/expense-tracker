import { Module } from "@nestjs/common";
import { CategoryController } from "./category.controller.js";
import { CategoryRepository } from "./category.repository.js";
import { CategoryService } from "./category.service.js";
@Module({
  controllers: [CategoryController],
  providers: [CategoryRepository, CategoryService],
  exports: [CategoryRepository]
})
export class CategoriesModule {}
