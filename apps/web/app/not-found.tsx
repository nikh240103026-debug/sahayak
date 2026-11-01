import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { EmptyFolder } from "@/components/illustrations";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { buttonStyles } from "@/components/ui";

export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <NextIntlClientProvider>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-xl space-y-5 px-4 py-20 text-center">
        <EmptyFolder className="mx-auto h-24 w-28" />
        <h1 className="text-4xl">{t("notFoundTitle")}</h1>
        <p className="text-lg text-muted">{t("notFoundBody")}</p>
        <Link href="/" className={buttonStyles({})}>
          {t("goHome")}
        </Link>
      </main>
      <SiteFooter />
    </NextIntlClientProvider>
  );
}
