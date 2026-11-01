import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { brand } from "@app/shared/brand";
import { LEGAL_UPDATED, legal, type LegalSlug } from "@/content/legal";
import { Notice } from "./ui";

function fill(text: string): string {
  const grievanceEmail = process.env.GRIEVANCE_EMAIL || "[GRIEVANCE_EMAIL]";
  const supportEmail = process.env.SUPPORT_EMAIL || "[SUPPORT_EMAIL]";
  return text
    .replaceAll("[LEGAL_ENTITY_NAME]", brand.legalEntityName)
    .replaceAll("[LEGAL_ENTITY_ADDRESS]", brand.legalEntityAddress)
    .replaceAll("[GRIEVANCE_OFFICER_NAME]", brand.grievanceOfficerName)
    .replaceAll("[JURISDICTION_CITY]", brand.jurisdictionCity)
    .replaceAll("{grievanceEmail}", grievanceEmail)
    .replaceAll("{supportEmail}", supportEmail)
    .replaceAll("{retentionHours}", String(Number(process.env.RETENTION_HOURS ?? 24) || 24))
    .replaceAll("{aiProvider}", process.env.LLM_PROVIDER === "anthropic" || !process.env.LLM_PROVIDER ? "Anthropic" : process.env.LLM_PROVIDER);
}

export async function LegalPage({ slug }: { slug: LegalSlug }) {
  const locale = (await getLocale()) as "en" | "hi";
  const doc = legal[slug][locale];
  const t = await getTranslations("legal");
  const format = await getFormatter();
  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <Notice tone="warning">{t("templateBanner")}</Notice>
      <header className="space-y-2">
        <h1 className="text-4xl">{fill(doc.title)}</h1>
        <p className="text-sm text-muted">{t("lastUpdated", { date: format.dateTime(new Date(LEGAL_UPDATED), { dateStyle: "long" }) })}</p>
        <p className="text-lg text-muted">{fill(doc.summary)}</p>
      </header>
      {doc.sections.map((s) => (
        <section key={s.heading} className="space-y-3">
          <h2 className="text-2xl">{fill(s.heading)}</h2>
          {s.paragraphs?.map((p) => (
            <p key={p}>{fill(p)}</p>
          ))}
          {s.bullets && (
            <ul className="list-disc space-y-1.5 pl-6">
              {s.bullets.map((b) => (
                <li key={b}>{fill(b)}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </article>
  );
}
