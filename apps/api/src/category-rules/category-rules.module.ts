import { Module } from "@nestjs/common";

import { CategoriesModule } from "../categories/categories.module.js";
import { CategoryRuleController } from "./category-rule.controller.js";
import { CategoryRuleRepository } from "./category-rule.repository.js";
import { CategoryRuleService } from "./category-rule.service.js";
import { CategoryRuleMutationService } from "./category-rule-mutation.service.js";

@Module({
  imports: [CategoriesModule],
  controllers: [CategoryRuleController],
  providers: [CategoryRuleRepository, CategoryRuleService, CategoryRuleMutationService],
  exports: [CategoryRuleRepository]
})
export class CategoryRulesModule {}
