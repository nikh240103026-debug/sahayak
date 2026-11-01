import { getLocale, getTranslations } from "next-intl/server";
import { CheckCircle2, HelpCircle, XCircle } from "lucide-react";
import type { EligibilityResult } from "@app/shared";
import { Card, Notice } from "./ui";

/** Deterministic eligibility result with a reason for every rule. */
export async function EligibilityCard({ result }: { result: EligibilityResult }) {
  const t = await getTranslations("wizard");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as "en" | "hi";
  const icon = { pass: CheckCircle2, fail: XCircle, unknown: HelpCircle };
  const tone = { pass: "text-success", fail: "text-danger", unknown: "text-muted" };
  const label = { pass: t("rulePass"), fail: t("ruleFail"), unknown: t("ruleUnknown") };
  return (
    <Card className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-2xl">{t("eligibilityTitle")}</h2>
        <p className="text-muted">{t("eligibilityIntro")}</p>
      </div>
      <ul className="space-y-3">
        {result.rules.map((r) => {
          const Icon = icon[r.status];
          return (
            <li key={r.id} className="flex gap-3">
              <Icon aria-hidden className={`mt-0.5 size-5 shrink-0 ${tone[r.status]}`} />
              <div>
                <p className="font-medium">{r.label[locale]}</p>
                <p className="text-sm text-muted">{label[r.status]}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <Notice
        tone={result.overall === "eligible" ? "success" : result.overall === "not_eligible" ? "danger" : "info"}
        role="status"
      >
        {result.overall === "eligible"
          ? t("overallEligible")
          : result.overall === "not_eligible"
            ? t("overallNotEligible")
            : t("overallIncomplete")}
      </Notice>
      <p className="text-sm text-muted">{tc("notLegalAdvice")}</p>
      {result.missingDocs.length > 0 && (
        <div>
          <p className="font-semibold">{t("missingDocs")}</p>
          <ul className="mt-1 list-disc pl-6 text-muted">
            {result.missingDocs.map((d) => (
              <li key={d.kind}>{d.label[locale]}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
