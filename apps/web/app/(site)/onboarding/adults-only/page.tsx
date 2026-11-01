import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyFolder } from "@/components/illustrations";
import { Card, buttonStyles } from "@/components/ui";

export const metadata = { title: "Adults only" };

export default async function AdultsOnly() {
  const t = await getTranslations("onboarding");
  const te = await getTranslations("errors");
  return (
    <Card className="mx-auto max-w-xl space-y-4 text-center">
      <EmptyFolder className="mx-auto h-20 w-24" />
      <h1 className="text-3xl">{t("under18Title")}</h1>
      <p className="text-muted">{t("under18Body")}</p>
      <Link href="/" className={buttonStyles({ variant: "secondary" })}>
        {te("goHome")}
      </Link>
    </Card>
  );
}
