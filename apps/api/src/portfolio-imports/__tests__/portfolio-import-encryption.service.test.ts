import { describe, expect, it } from "vitest";

import { PortfolioImportEncryptionService } from "../portfolio-import-encryption.service.js";

const encryption = new PortfolioImportEncryptionService({
  env: {
    NODE_ENV: "test",
    PORTFOLIO_IMPORT_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64")
  }
});

describe("PortfolioImportEncryptionService", () => {
  it("round-trips upload bytes and creates a fresh nonce for each sealing operation", () => {
    const first = encryption.seal(Buffer.from("%PDF-1.3 example", "utf8"));
    const second = encryption.seal(Buffer.from("%PDF-1.3 example", "utf8"));

    expect(encryption.open(first).toString("utf8")).toBe("%PDF-1.3 example");
    expect(first.nonce.equals(second.nonce)).toBe(false);
    expect(first.ciphertext.equals(second.ciphertext)).toBe(false);
  });

  it("rejects altered encrypted material", () => {
    const sealed = encryption.seal(Buffer.from("sensitive CAS password", "utf8"));
    const alteredTag = Buffer.from(sealed.authTag);
    alteredTag[0] = alteredTag[0] === 0 ? 1 : 0;

    expect(() => encryption.open({ ...sealed, authTag: alteredTag })).toThrow();
  });
});
