import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, PageTitle, buttonStyles } from "@/components/ui";
import { requireOnboarded } from "@/lib/auth";
import { listServices } from "@/lib/data";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "Choose a scheme" };

export default async function ChooseService() {
  await requireOnboarded("/app/new");
  const t = await getTranslations("wizard");
  const locale = (await getLocale()) as "en" | "hi";
  const services = await listServices(await supabaseServer());
  return (
    <div>
      <PageTitle title={t("chooseTitle")} intro={t("chooseIntro")} />
      <ul className="grid gap-4 md:grid-cols-2">
        {services.map((s) => (
          <li key={s.slug}>
            <Card className="flex h-full flex-col gap-4">
              {s.portalKind === "demo" && (
                <span className="w-fit rounded-full border border-accent bg-accent/15 px-2.5 py-0.5 text-sm font-semibold">
                  {t("practiceTag")}
                </span>
              )}
              <h2 className="text-2xl">{s.name[locale]}</h2>
              <p className="flex-1 text-muted">{s.summary[locale]}</p>
              <Link href={`/app/new/${s.slug}`} className={buttonStyles({ className: "w-fit" })}>
                {t("choose")}
              </Link>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
