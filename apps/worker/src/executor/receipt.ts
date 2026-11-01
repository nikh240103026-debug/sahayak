import type { Browser } from "playwright";
import { brand } from "@app/shared/brand";
import type { Localized } from "@app/shared";

export interface ReceiptPdfInput {
  serviceName: Localized;
  portalName: Localized;
  trackingId: string;
  submittedAt: Date;
  summaryEn: string;
  summaryHi: string;
  acknowledgementJpeg: Buffer | null;
  isDemo: boolean;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Render the receipt with Chromium's print engine (correct Devanagari shaping,
 * which pdf-lib cannot do). The page is offline: every request is aborted.
 */
export async function renderReceiptPdf(browser: Browser, r: ReceiptPdfInput): Promise<Buffer> {
  const context = await browser.newContext({ javaScriptEnabled: false });
  await context.route("**/*", (route) => route.abort());
  try {
    const page = await context.newPage();
    const when = new Intl.DateTimeFormat("en-IN", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    }).format(r.submittedAt);
    const img = r.acknowledgementJpeg
      ? `<figure><img alt="Portal acknowledgement page" src="data:image/jpeg;base64,${r.acknowledgementJpeg.toString("base64")}"/><figcaption>Screenshot of the portal's acknowledgement page</figcaption></figure>`
      : "";
    await page.setContent(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Receipt ${esc(r.trackingId)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: "DM Sans", "Noto Sans", "Noto Sans Devanagari", "Nirmala UI", Arial, sans-serif; color: #1E2A32; font-size: 11pt; line-height: 1.55; }
  h1 { font-family: Georgia, "Noto Serif", serif; font-size: 20pt; margin: 0 0 4pt; }
  .muted { color: #5E6B73; font-size: 9.5pt; }
  .stamp { display: inline-block; border: 2.5pt solid #2B3A67; color: #2B3A67; padding: 4pt 10pt; border-radius: 6pt; transform: rotate(-4deg); font-weight: 700; letter-spacing: 1pt; }
  .id { font-family: "JetBrains Mono", Consolas, monospace; font-size: 15pt; font-weight: 700; }
  .box { border: 1pt solid #DDD2C0; border-radius: 8pt; padding: 10pt 12pt; margin: 10pt 0; background: #FFFDF8; }
  .hi { font-family: "Noto Sans Devanagari", "Nirmala UI", "Mangal", sans-serif; }
  figure { margin: 12pt 0 0; } img { max-width: 100%; border: 1pt solid #DDD2C0; border-radius: 6pt; }
  figcaption { font-size: 9pt; color: #5E6B73; }
  footer { margin-top: 14pt; font-size: 8.5pt; color: #5E6B73; }
</style></head><body>
  <p class="muted">${esc(brand.name)} · ${esc(brand.notAffiliated.en)}</p>
  <h1>Application receipt</h1>
  <p><span class="stamp">SUBMITTED</span></p>
  <div class="box">
    <div class="muted">Tracking ID</div>
    <div class="id">${esc(r.trackingId)}</div>
    <div class="muted">${esc(r.serviceName.en)} · ${esc(r.portalName.en)} · ${esc(when)} IST</div>
  </div>
  <h2>Summary</h2>
  <p>${esc(r.summaryEn)}</p>
  <h2 class="hi" lang="hi">सारांश</h2>
  <p class="hi" lang="hi">${esc(r.summaryHi)}</p>
  ${img}
  <footer>
    ${r.isDemo ? `${esc(brand.demoPortal.banner)}. ` : ""}This receipt records what the assistant did on your behalf after your approval.
    It is not an official document and does not guarantee approval, selection or payment.
  </footer>
</body></html>`,
      { waitUntil: "load" },
    );
    return Buffer.from(await page.pdf({ format: "A4", printBackground: true }));
  } finally {
    await context.close();
  }
}
