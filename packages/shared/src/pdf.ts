import { extractText } from "unpdf";

/** Text layer of a PDF (empty string for scanned PDFs without one). */
export async function pdfText(bytes: Uint8Array): Promise<string> {
  const { text } = await extractText(new Uint8Array(bytes), { mergePages: true });
  return text.trim();
}
