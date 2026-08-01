import { Injectable } from "@nestjs/common";
import type {
  Category,
  CategoryId,
  CreateCategory,
  UpdateCategory,
  UpdateCategoryGroup
} from "@treasury-ops/shared";

import type { DbTx } from "../common/db/db-txn.js";
import { isForeignKeyViolation, isUniqueViolation } from "../common/db/postgres-error.js";
import { CategoryHierarchyConflictError } from "../common/errors/category-hierarchy-conflict.error.js";
import { CategoryInUseError } from "../common/errors/category-in-use.error.js";
import { CategoryNameConflictError } from "../common/errors/category-name-conflict.error.js";
import { CategoryParentKindMismatchError } from "../common/errors/category-parent-kind-mismatch.error.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { CategoryRepository } from "./category.repository.js";

@Injectable()
export class CategoryService {
  constructor(private readonly categories: CategoryRepository) {}
  async create(userId: string, input: CreateCategory, tx?: DbTx): Promise<Category> {
    if (input.parentId !== undefined) {
      const parent = await this.categories.findActiveById(userId, input.parentId, tx);
      if (parent === null) throw new EntityNotFoundError("Parent category");
      if (parent.kind !== input.kind) throw new CategoryParentKindMismatchError();
    }
    try {
      return await this.categories.create(userId, input, tx);
    } catch (error: unknown) {
      if (isUniqueViolation(error)) throw new CategoryNameConflictError();
      throw error;
    }
  }

  list(userId: string, includeArchived = false): Promise<Category[]> {
    return this.categories.list(userId, includeArchived);
  }

  async archive(userId: string, categoryId: CategoryId, tx?: DbTx): Promise<void> {
    const active = await this.categories.list(userId, false, tx);
    if (!active.some((category) => category.id === categoryId)) {
      throw new EntityNotFoundError("Category");
    }
    const subtreeIds = collectSubtreeIds(active, categoryId);
    const archived = await this.categories.archive(userId, subtreeIds, tx);
    if (archived === 0) throw new EntityNotFoundError("Category");
  }

  async update(
    userId: string,
    categoryId: CategoryId,
    patch: UpdateCategory,
    tx?: DbTx
  ): Promise<Category> {
    return this.reparentCategory(userId, categoryId, patch, tx);
  }

  async reparentCategory(
    userId: string,
    categoryId: CategoryId,
    patch: UpdateCategory,
    tx?: DbTx
  ): Promise<Category> {
    const all = await this.categories.list(userId, true, tx);
    const current = all.find((category) => category.id === categoryId);
    if (current === undefined) throw new EntityNotFoundError("Category");

    if (patch.parentId === categoryId) {
      throw new CategoryHierarchyConflictError("A category cannot be its own parent.");
    }

    if (patch.parentId !== null) {
      const parent = all.find((category) => category.id === patch.parentId);
      if (parent === undefined) {
        throw new CategoryHierarchyConflictError("The selected parent category does not exist.");
      }
      if (!current.isArchived && parent.isArchived) {
        throw new CategoryHierarchyConflictError("The selected parent category is not active.");
      }
      if (parent.kind !== current.kind) throw new CategoryParentKindMismatchError();
      if (collectSubtreeIds(all, categoryId).includes(parent.id)) {
        throw new CategoryHierarchyConflictError(
          "A category cannot be moved beneath one of its descendants."
        );
      }
    }

    if (
      !current.isArchived &&
      hasActiveNameCollision(all, patch.name, patch.parentId, categoryId)
    ) {
      throw new CategoryNameConflictError();
    }

    try {
      const updated = await this.categories.update(userId, categoryId, patch, tx);
      if (updated === null) throw new EntityNotFoundError("Category");
      return updated;
    } catch (error: unknown) {
      if (isUniqueViolation(error)) throw new CategoryNameConflictError();
      throw error;
    }
  }

  async unarchive(userId: string, categoryId: CategoryId, tx?: DbTx): Promise<Category> {
    const all = await this.categories.list(userId, true, tx);
    const current = all.find((category) => category.id === categoryId && category.isArchived);
    if (current === undefined) throw new EntityNotFoundError("Archived category");

    if (current.parentId !== undefined) {
      const parent = all.find((category) => category.id === current.parentId);
      if (parent === undefined || parent.isArchived) {
        throw new CategoryHierarchyConflictError(
          "Unarchive the parent category before restoring this category."
        );
      }
    }

    if (hasActiveNameCollision(all, current.name, current.parentId ?? null, current.id)) {
      throw new CategoryNameConflictError();
    }

    try {
      const restored = await this.categories.unarchive(userId, categoryId, tx);
      if (restored === null) throw new EntityNotFoundError("Archived category");
      return restored;
    } catch (error: unknown) {
      if (isUniqueViolation(error)) throw new CategoryNameConflictError();
      throw error;
    }
  }

  async permanentlyDelete(userId: string, categoryId: CategoryId, tx?: DbTx): Promise<void> {
    const category = await this.categories.findById(userId, categoryId, tx);
    if (category === null) throw new EntityNotFoundError("Category");
    if (!category.isArchived) {
      throw new CategoryInUseError("Archive this category before permanently deleting it.");
    }
    if (await this.categories.hasDependents(userId, categoryId, tx)) {
      throw new CategoryInUseError(
        "This category has subcategories or linked records and cannot be permanently deleted."
      );
    }
    try {
      if (!(await this.categories.permanentlyDelete(userId, categoryId, tx))) {
        throw new EntityNotFoundError("Archived category");
      }
    } catch (error: unknown) {
      if (isForeignKeyViolation(error)) throw new CategoryInUseError();
      throw error;
    }
  }
  async updateGroup(
    userId: string,
    categoryId: CategoryId,
    patch: UpdateCategoryGroup
  ): Promise<Category> {
    const updated = await this.categories.updateGroup(userId, categoryId, patch);
    if (updated === null) throw new EntityNotFoundError("Category");
    return updated;
  }
}

function collectSubtreeIds(categories: readonly Category[], rootId: CategoryId): CategoryId[] {
  const ids: CategoryId[] = [];
  const pending: CategoryId[] = [rootId];
  while (pending.length > 0) {
    const currentId = pending.shift();
    if (currentId === undefined) break;
    ids.push(currentId);
    for (const category of categories) {
      if (category.parentId === currentId) pending.push(category.id);
    }
  }
  return ids;
}

function hasActiveNameCollision(
  categories: readonly Category[],
  name: string,
  parentId: CategoryId | null,
  excludedId: CategoryId
): boolean {
  return categories.some(
    (category) =>
      !category.isArchived &&
      category.id !== excludedId &&
      category.name === name &&
      (category.parentId ?? null) === parentId
  );
}
