import { getTranslations } from "next-intl/server";
import { Mail } from "lucide-react";
import { brand } from "@app/shared/brand";
import { Card, Notice, PageTitle } from "@/components/ui";

export const metadata = { title: "Grievances" };

export default async function Grievance() {
  const t = await getTranslations("grievance");
  const tl = await getTranslations("legal");
  const email = process.env.GRIEVANCE_EMAIL || "[GRIEVANCE_EMAIL]";
  const support = process.env.SUPPORT_EMAIL || "[SUPPORT_EMAIL]";
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Notice tone="warning">{tl("templateBanner")}</Notice>
      <PageTitle title={t("title")} intro={t("intro")} />
      <Card className="space-y-3">
        <p className="text-sm text-muted">{t("officer")}</p>
        <p className="text-xl font-semibold">{brand.grievanceOfficerName}</p>
        <p>
          {brand.legalEntityName}, {brand.legalEntityAddress}
        </p>
        <p className="flex items-center gap-2">
          <Mail aria-hidden className="size-5 text-primary" />
          <span className="sr-only">{t("email")}: </span>
          <a href={`mailto:${email}`} className="font-semibold">
            {email}
          </a>
        </p>
      </Card>
      <ul className="list-disc space-y-2 pl-6">
        <li>{t("ack")}</li>
        <li>{t("resolution")}</li>
        <li>{t("include")}</li>
        <li>{t("rights")}</li>
      </ul>
      <p className="text-muted">{t("support", { email: support })}</p>
    </div>
  );
}
