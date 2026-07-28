import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("integration harness architecture", () => {
  it("routes every integration database through the registered test harness", async () => {
    const integrationRoot = resolve(process.cwd(), "test/integration");
    const files = await integrationFiles(integrationRoot);
    expect(files.length).toBeGreaterThan(30);

    for (const file of files) {
      const source = await readFile(file, "utf8");
      expect(source, `${file} bypasses createTestDb and its automatic invariants`).toContain(
        "createTestDb()"
      );
      expect(source, `${file} starts PostgreSQL directly`).not.toContain("new PostgreSqlContainer");
    }
  });
});

async function integrationFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "support") files.push(...(await integrationFiles(path)));
    } else if (entry.name.endsWith(".integration.ts")) {
      files.push(path);
    }
  }
  return files;
}
