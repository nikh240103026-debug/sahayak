import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { INDIAN_STATES, buildPlan, fieldsUsedByService, suggestProfile, type ServiceDefinition } from "@app/shared";
import { ConfirmProfile, type ConfirmField } from "@/components/confirm-profile";
import { RunView } from "@/components/run-view";
import { StartForm } from "@/components/start-form";
import { Card, Notice, PageTitle, buttonStyles } from "@/components/ui";
import { WizardSteps } from "@/components/wizard-steps";
import { requireOnboarded } from "@/lib/auth";
import { decryptExtraction, getService, latestDocuments, loadProfile, type DocumentRow } from "@/lib/data";
import { loadRunState } from "@/lib/run-state";
import { getOwnRun } from "@/lib/runs";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "Your application" };

async function ReviewPanel({
  runId,
  service,
  plan,
  locale,
  restartLabel,
}: {
  runId: string;
  service: ServiceDefinition;
  plan: ReturnType<typeof buildPlan>;
  locale: "en" | "hi";
  restartLabel?: string;
}) {
  const t = await getTranslations("review");
  const pauses = [...new Set(plan.steps.flatMap((s) => s.humanCheckpoints))].map((k) =>
    k === "captcha" ? t("pauseCaptcha") : k === "otp" ? t("pauseOtp") : t("pauseFinal"),
  );
  const uploads = plan.steps.flatMap((s) => s.uploads.map((u) => u.label[locale]));
  if (!plan.ready) {
    const missing = [
      ...plan.missingFields.map((f) => f.label[locale]),
      ...plan.missingDocs.map((k) => service.requiredDocs.find((d) => d.kind === k)?.label[locale] ?? k),
    ];
    return (
      <Card className="space-y-4">
        <Notice tone="warning" role="alert">
          {t("notReady", { list: missing.join(", ") })}
        </Notice>
        <Link href={`/app/runs/${runId}`} className={buttonStyles({ variant: "secondary" })}>
          {t("editDetails")}
        </Link>
      </Card>
    );
  }
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-3xl">{t("title")}</h2>
        <p className="max-w-2xl text-muted">{t("intro")}</p>
      </header>
      <ol className="grid gap-3 md:grid-cols-2">
        {plan.steps
          .filter((s) => s.entries.length > 0)
          .map((s) => (
            <li key={s.id}>
              <Card className="h-full p-4">
                <h3 className="mb-2 font-sans text-base font-semibold">{s.title[locale]}</h3>
                <dl className="space-y-1 text-sm">
                  {s.entries.map((e) => (
                    <div key={e.field} className="flex flex-wrap justify-between gap-x-3">
                      <dt className="text-muted">{e.label[locale]}</dt>
                      <dd className="font-medium break-all">{e.value}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            </li>
          ))}
      </ol>
      <Notice tone="info">
        <p>{t("willPause", { list: pauses.join(", ") })}</p>
        {uploads.length > 0 && <p>{t("uploads", { list: uploads.join(", ") })}</p>}
      </Notice>
      <StartForm runId={runId} label={restartLabel} />
      <Link href={`/app/runs/${runId}`} className={buttonStyles({ variant: "ghost" })}>
        {t("editDetails")}
      </Link>
    </div>
  );
}

function confirmFields(
  service: ServiceDefinition,
  locale: "en" | "hi",
  userId: string,
  docs: DocumentRow[],
  profile: Awaited<ReturnType<typeof loadProfile>>,
): ConfirmField[] {
  const extractions = docs.flatMap((d) => {
    const extraction = decryptExtraction(userId, d);
    return extraction ? [{ documentId: d.id, kind: d.kind, extraction }] : [];
  });
  const suggestions = suggestProfile(service, extractions, profile);
  return fieldsUsedByService(service).map((f) => {
    const s = suggestions.find((x) => x.field === f.key);
    const existing = profile[f.key];
    // A value the user already confirmed wins over a fresh suggestion.
    const useExisting = existing?.confirmed;
    const docKind = s?.sourceDocumentId ? docs.find((d) => d.id === s.sourceDocumentId)?.kind : undefined;
    return {
      key: f.key,
      label: f.label[locale],
      help: f.help?.[locale],
      type: f.type,
      options: f.options ?? (f.optionsRef === "indianStates" ? [...INDIAN_STATES] : undefined),
      required: f.required,
      value: useExisting ? existing.value : (s?.value ?? existing?.value ?? ""),
      confidence: useExisting ? null : (s?.confidence ?? null),
      sourceDocumentId: useExisting ? null : (s?.sourceDocumentId ?? null),
      sourceLabel: !useExisting && docKind ? (service.requiredDocs.find((d) => d.kind === docKind)?.label[locale] ?? null) : null,
      rawValue: useExisting ? null : (s?.rawValue ?? null),
    };
  });
}

export default async function RunPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { user } = await requireOnboarded(`/app/runs/${id}`);
  const run = await getOwnRun(user.id, id);
  if (!run) notFound();
  const sb = await supabaseServer();
  const service = await getService(sb, run.service_slug);
  if (!service) notFound();
  const locale = (await getLocale()) as "en" | "hi";
  const t = await getTranslations("run");
  const [profile, docs] = await Promise.all([loadProfile(sb, user.id), latestDocuments(sb, user.id)]);
  const plan = buildPlan(service, profile, new Set(docs.map((d) => d.kind)));

  const header = <PageTitle eyebrow={t("title")} title={service.name[locale]} />;

  if (run.status === "NEEDS_PROFILE_CONFIRM") {
    const reviewing = sp.view === "review";
    return (
      <div>
        <WizardSteps current={reviewing ? 3 : 2} />
        {header}
        {run.error && (
          <Notice tone="warning" role="alert" className="mb-6">
            {run.error}
          </Notice>
        )}
        {reviewing ? (
          <ReviewPanel runId={run.id} service={service} plan={plan} locale={locale} />
        ) : (
          <ConfirmProfile
            runId={run.id}
            fields={confirmFields(service, locale, user.id, docs, profile)}
            canReread={!run.manual_entry && docs.length > 0}
          />
        )}
      </div>
    );
  }

  const state = await loadRunState(user.id, run.id);
  if (!state) notFound();
  const stopped = run.status === "FAILED" || run.status === "PAUSED_EXPIRED";

  return (
    <div className="space-y-8">
      <WizardSteps current={4} />
      {header}
      {(stopped || run.status === "CANCELLED") && (
        <Notice
          tone={run.status === "CANCELLED" ? "info" : "warning"}
          role="alert"
          title={run.status === "CANCELLED" ? t("cancelledTitle") : run.status === "FAILED" ? t("stoppedTitle") : t("expiredTitle")}
        >
          {run.error}
        </Notice>
      )}
      {stopped && <ReviewPanel runId={run.id} service={service} plan={plan} locale={locale} restartLabel={t("restart")} />}
      <RunView runId={run.id} initial={state} warmingUp={run.status === "QUEUED"} />
    </div>
  );
}
