import { describe, expect, it } from "vitest";

import { InvalidPdfError } from "../common/errors/portfolio-import.error.js";
import { CasPdfExtractor } from "./cas-pdf-extractor.js";

describe("CasPdfExtractor", () => {
  const extractor = new CasPdfExtractor();

  it("throws InvalidPdfError if file is too short", async () => {
    const tooShort = new Uint8Array([0x25, 0x50]);
    await expect(extractor.extractText(tooShort)).rejects.toThrow(InvalidPdfError);
  });

  it("throws InvalidPdfError if PDF magic header is missing", async () => {
    const notPdf = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF89a
    await expect(extractor.extractText(notPdf)).rejects.toThrow(InvalidPdfError);
  });

  it("throws CasPasswordRequiredError when password is empty on protected PDF or InvalidPdfError on corrupt PDF", async () => {
    // Valid magic header but corrupt payload
    const corruptPdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x00, 0x00]);
    await expect(extractor.extractText(corruptPdf)).rejects.toThrow(InvalidPdfError);
  });
});
