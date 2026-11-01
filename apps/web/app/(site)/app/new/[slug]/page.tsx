import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { evaluateEligibility } from "@app/shared";
import { BeginForm } from "@/components/begin-form";
import { DocumentUploader } from "@/components/document-uploader";
import { EligibilityCard } from "@/components/eligibility-card";
import { Card, Notice, PageTitle } from "@/components/ui";
import { WizardSteps } from "@/components/wizard-steps";
import { requireOnboarded } from "@/lib/auth";
import { getService, latestDocuments, loadConsents, loadProfile } from "@/lib/data";
import { env } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "New application" };

export default async function NewApplication({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user } = await requireOnboarded(`/app/new/${slug}`);
  const sb = await supabaseServer();
  const service = await getService(sb, slug);
  if (!service) notFound();
  const t = await getTranslations("wizard");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as "en" | "hi";
  const [profile, docs, consents] = await Promise.all([loadProfile(sb, user.id), latestDocuments(sb, user.id), loadConsents(sb, user.id)]);
  const kinds = new Set(docs.map((d) => d.kind));
  const eligibility = evaluateEligibility(service, profile, kinds);
  const retentionHours = env().RETENTION_HOURS;

  return (
    <div className="space-y-8">
      <WizardSteps current={docs.length ? 1 : 0} />
      <PageTitle eyebrow={service.portalKind === "demo" ? t("practiceTag") : undefined} title={service.name[locale]} intro={service.summary[locale]} />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <EligibilityCard result={eligibility} />
        <Card className="space-y-5">
          <div className="space-y-1">
            <h2 className="text-2xl">{t("uploadTitle")}</h2>
            <p className="text-muted">{t("uploadIntro")}</p>
          </div>
          <Notice tone="warning">{t("uploadAadhaarWarning")}</Notice>
          <DocumentUploader
            retentionHours={retentionHours}
            docs={service.requiredDocs.map((d) => {
              const up = docs.find((x) => x.kind === d.kind);
              return {
                kind: d.kind,
                label: d.label[locale],
                hint: d.hint[locale],
                accept: ".pdf,.jpg,.jpeg,.png",
                maxBytes: d.maxBytes,
                uploaded: up ? { id: up.id, sizeKb: Math.ceil(up.size_bytes / 1024) } : null,
              };
            })}
          />
          <BeginForm
            slug={slug}
            aiAllowed={consents.ai_processing.granted && !env().LLM_DISABLED}
            ready={eligibility.missingDocs.length === 0 && eligibility.overall !== "not_eligible"}
          />
          <p className="text-sm text-muted">{tc("aiNotice")}</p>
        </Card>
      </div>
    </div>
  );
}
