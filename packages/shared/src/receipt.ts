import type { Locale, Localized } from "./schemas";

/**
 * Plain-language receipt summaries. Written from a fixed template, not by a model,
 * so the summary can never claim something that did not happen.
 */

export interface ReceiptFacts {
  serviceName: Localized;
  portalName: Localized;
  trackingId: string;
  submittedAt: Date;
  isDemo: boolean;
}

function formatDate(d: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(d);
}

export function receiptSummary(facts: ReceiptFacts, locale: Locale): string {
  const when = formatDate(facts.submittedAt, locale);
  if (locale === "hi") {
    return [
      `आपका "${facts.serviceName.hi}" का आवेदन ${when} को ${facts.portalName.hi} पर जमा हो गया।`,
      `आपकी ट्रैकिंग आईडी ${facts.trackingId} है। इसे सँभालकर रखें, स्थिति देखने के लिए इसकी ज़रूरत होगी।`,
      facts.isDemo
        ? "यह एक काल्पनिक अभ्यास पोर्टल था, इसलिए यह आवेदन किसी असली दफ़्तर तक नहीं पहुँचा।"
        : "आगे का फ़ैसला संबंधित विभाग करेगा।",
      "आवेदन जमा करने से मंज़ूरी, चयन या भुगतान की कोई गारंटी नहीं मिलती।",
    ].join(" ");
  }
  return [
    `Your application for "${facts.serviceName.en}" was submitted on the ${facts.portalName.en} on ${when}.`,
    `Your tracking ID is ${facts.trackingId}. Keep it safe: you need it to check the status.`,
    facts.isDemo
      ? "This was a fictional practice portal, so no real office received this application."
      : "The department will make the decision from here.",
    "Submitting an application never guarantees approval, selection or payment.",
  ].join(" ");
}
