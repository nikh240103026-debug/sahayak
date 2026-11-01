import type { UploadMime } from "./schemas";

/** Detect a file's real type from its first bytes (never trust the browser-supplied MIME type). */
export function sniffMime(bytes: Uint8Array): UploadMime | null {
  const b = bytes;
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) {
    return "application/pdf"; // %PDF-
  }
  if (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  ) {
    return "image/png";
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  return null;
}

export function extensionFor(mime: UploadMime): string {
  return mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : "jpg";
}
