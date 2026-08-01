import type { Category } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { CategoryController } from "../category.controller.js";

const CATEGORY_ID = "123e4567-e89b-42d3-a456-426614174000";
const KEY = "00000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-01T00:00:00.000Z");
const USER = { id: "u1" };
const CATEGORY: Category = {
  id: CATEGORY_ID,
  userId: "u1",
  name: "Food",
  kind: "expense",
  isArchived: false,
  createdAt: NOW,
  updatedAt: NOW
};

function response() {
  const value = { status: vi.fn(), setHeader: vi.fn() };
  value.status.mockReturnValue(value);
  return value;
}

describe("CategoryController edge coverage", () => {
  it("uses the legacy service path when no mutation service is injected", async () => {
    const categories = {
      create: vi.fn().mockResolvedValue(CATEGORY),
      archive: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(CATEGORY),
      unarchive: vi.fn().mockResolvedValue(CATEGORY),
      permanentlyDelete: vi.fn().mockResolvedValue(undefined),
      updateGroup: vi.fn().mockResolvedValue(CATEGORY)
    };
    // @ts-expect-error - focused service double.
    const controller = new CategoryController(categories);

    await expect(controller.create(USER, { name: "Food", kind: "expense" })).resolves.toBe(
      CATEGORY
    );
    await expect(controller.archive(USER, CATEGORY_ID)).resolves.toBeUndefined();
    await expect(
      controller.update(USER, CATEGORY_ID, {
        name: "Food",
        parentId: null,
        icon: null,
        color: null
      })
    ).resolves.toBe(CATEGORY);
    await expect(controller.unarchive(USER, CATEGORY_ID)).resolves.toBe(CATEGORY);
    await expect(controller.permanentlyDelete(USER, CATEGORY_ID)).resolves.toBeUndefined();
    await expect(controller.updateGroup(USER, CATEGORY_ID, { group: "essential" })).resolves.toBe(
      CATEGORY
    );
  });

  it("covers mutation responses with replayed and non-replayed results", async () => {
    const mutations = {
      create: vi.fn().mockResolvedValue({ result: CATEGORY, replayed: false }),
      archive: vi.fn().mockResolvedValue({ result: null, replayed: true }),
      update: vi.fn().mockResolvedValue({ result: CATEGORY, replayed: true }),
      unarchive: vi.fn().mockResolvedValue({ result: CATEGORY, replayed: true }),
      permanentlyDelete: vi.fn().mockResolvedValue({ result: null, replayed: true }),
      updateGroup: vi.fn().mockResolvedValue({ result: CATEGORY, replayed: true })
    };
    // @ts-expect-error - focused service doubles.
    const controller = new CategoryController({}, mutations);
    const createResponse = response();
    const archiveResponse = response();
    const updateCategoryResponse = response();
    const unarchiveResponse = response();
    const deleteResponse = response();
    const updateResponse = response();

    await controller.create(
      USER,
      { name: "Food", kind: "expense" },
      KEY,
      // @ts-expect-error - focused response double.
      createResponse
    );
    await controller.archive(
      USER,
      CATEGORY_ID,
      KEY,
      // @ts-expect-error - focused response double.
      archiveResponse
    );
    await controller.update(
      USER,
      CATEGORY_ID,
      { name: "Food", parentId: null, icon: null, color: null },
      KEY,
      // @ts-expect-error - focused response double.
      updateCategoryResponse
    );
    await controller.unarchive(
      USER,
      CATEGORY_ID,
      KEY,
      // @ts-expect-error - focused response double.
      unarchiveResponse
    );
    await controller.permanentlyDelete(
      USER,
      CATEGORY_ID,
      KEY,
      // @ts-expect-error - focused response double.
      deleteResponse
    );
    await controller.updateGroup(
      USER,
      CATEGORY_ID,
      { group: null },
      KEY,
      // @ts-expect-error - focused response double.
      updateResponse
    );

    expect(createResponse.setHeader).not.toHaveBeenCalled();
    expect(archiveResponse.setHeader).toHaveBeenCalledWith("Idempotency-Replayed", "true");
    expect(updateCategoryResponse.status).toHaveBeenCalledWith(200);
    expect(unarchiveResponse.status).toHaveBeenCalledWith(200);
    expect(deleteResponse.setHeader).toHaveBeenCalledWith("Idempotency-Replayed", "true");
    expect(updateResponse.status).toHaveBeenCalledWith(200);
  });

  it("does not access an absent response on replay", async () => {
    const mutations = {
      create: vi.fn().mockResolvedValue({ result: CATEGORY, replayed: true }),
      archive: vi.fn().mockResolvedValue({ result: null, replayed: true }),
      update: vi.fn().mockResolvedValue({ result: CATEGORY, replayed: true }),
      unarchive: vi.fn().mockResolvedValue({ result: CATEGORY, replayed: true }),
      permanentlyDelete: vi.fn().mockResolvedValue({ result: null, replayed: true }),
      updateGroup: vi.fn().mockResolvedValue({ result: CATEGORY, replayed: true })
    };
    // @ts-expect-error - focused service doubles.
    const controller = new CategoryController({}, mutations);

    await expect(controller.create(USER, { name: "Food", kind: "expense" }, KEY)).resolves.toBe(
      CATEGORY
    );
    await expect(controller.archive(USER, CATEGORY_ID, KEY)).resolves.toBeUndefined();
    await expect(
      controller.update(
        USER,
        CATEGORY_ID,
        { name: "Food", parentId: null, icon: null, color: null },
        KEY
      )
    ).resolves.toBe(CATEGORY);
    await expect(controller.unarchive(USER, CATEGORY_ID, KEY)).resolves.toBe(CATEGORY);
    await expect(controller.permanentlyDelete(USER, CATEGORY_ID, KEY)).resolves.toBeUndefined();
    await expect(controller.updateGroup(USER, CATEGORY_ID, { group: null }, KEY)).resolves.toBe(
      CATEGORY
    );
  });
});
