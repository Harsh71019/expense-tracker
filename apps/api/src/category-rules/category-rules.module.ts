import { Module } from "@nestjs/common";

import { CategoriesModule } from "../categories/categories.module.js";
import { CategoryRuleController } from "./category-rule.controller.js";
import { CategoryRuleRepository } from "./category-rule.repository.js";
import { CategoryRuleService } from "./category-rule.service.js";
import { CategoryRuleMutationService } from "./category-rule-mutation.service.js";
import { CategorySuggestionRepository } from "./category-suggestion.repository.js";
import { CategorySuggestionService } from "./category-suggestion.service.js";

@Module({
  imports: [CategoriesModule],
  controllers: [CategoryRuleController],
  providers: [
    CategoryRuleRepository,
    CategoryRuleService,
    CategoryRuleMutationService,
    CategorySuggestionRepository,
    CategorySuggestionService
  ],
  exports: [CategoryRuleRepository, CategorySuggestionService]
})
export class CategoryRulesModule {}
