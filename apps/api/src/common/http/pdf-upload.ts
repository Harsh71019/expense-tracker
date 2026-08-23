import { FileInterceptor } from "@nestjs/platform-express";
import { MAX_PORTFOLIO_IMPORT_FILE_SIZE_BYTES } from "@treasury-ops/shared";

/** Abort oversized PDF uploads at the parser before buffering the whole body. */
export const pdfUploadInterceptor = FileInterceptor("file", {
  limits: { fileSize: MAX_PORTFOLIO_IMPORT_FILE_SIZE_BYTES, files: 1 }
});
