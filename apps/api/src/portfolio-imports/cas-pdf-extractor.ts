import { PDFParse } from "pdf-parse";

import { DomainError } from "../common/errors/domain-error.js";
import {
  CasPasswordInvalidError,
  CasPasswordRequiredError,
  InvalidPdfError,
  UnsupportedScannedStatementError
} from "../common/errors/portfolio-import.error.js";

const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46, 0x2d] as const; // %PDF-

/**
 * Text-only PDF extractor with password handling. Does not execute scripts,
 * render canvases, or invoke OCR.
 */
export class CasPdfExtractor {
  async extractText(pdfBytes: Uint8Array, password?: string): Promise<string> {
    if (pdfBytes.byteLength < 5) {
      throw new InvalidPdfError("The uploaded file is too short to be a valid PDF.");
    }
    for (let i = 0; i < PDF_MAGIC_BYTES.length; i++) {
      if (pdfBytes[i] !== PDF_MAGIC_BYTES[i]) {
        throw new InvalidPdfError("The uploaded file lacks a valid PDF magic header.");
      }
    }

    let parser: PDFParse | undefined;
    try {
      parser = new PDFParse({
        data: pdfBytes,
        ...(password !== undefined && password.trim().length > 0
          ? { password: password.trim() }
          : {}),
        stopAtErrors: true,
        verbosity: 0
      });
      const result = await parser.getText();
      const text = result.text.trim();
      if (text.length === 0) {
        throw new UnsupportedScannedStatementError();
      }
      return text;
    } catch (error: unknown) {
      if (error instanceof DomainError) throw error;
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : "";

      const lower = errorMsg.toLowerCase();
      if (
        errorName.includes("Password") ||
        lower.includes("password") ||
        lower.includes("encrypted") ||
        lower.includes("bad password")
      ) {
        if (
          password === undefined ||
          password.trim().length === 0 ||
          lower.includes("need password") ||
          lower.includes("no password") ||
          lower.includes("password required")
        ) {
          throw new CasPasswordRequiredError();
        }
        throw new CasPasswordInvalidError();
      }

      if (
        lower.includes("formaterror") ||
        lower.includes("invalid pdf") ||
        lower.includes("corrupt") ||
        lower.includes("damaged")
      ) {
        throw new InvalidPdfError("The uploaded PDF is malformed or corrupted.");
      }

      throw new InvalidPdfError("Failed to extract text from the PDF statement.");
    } finally {
      if (parser !== undefined) {
        try {
          await parser.destroy();
        } catch {
          // ignore cleanup error
        }
      }
    }
  }
}
