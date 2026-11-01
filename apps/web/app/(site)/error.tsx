"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, buttonStyles } from "@/components/ui";

export default function SiteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errors");
  return (
    <div className="mx-auto max-w-xl space-y-5 py-12 text-center">
      <h1 className="text-4xl">{t("errorTitle")}</h1>
      <p className="text-lg text-muted">{t("errorBody")}</p>
      <div className="flex justify-center gap-3">
        <Button onClick={reset}>{t("tryAgain")}</Button>
        <Link href="/" className={buttonStyles({ variant: "secondary" })}>
          {t("goHome")}
        </Link>
      </div>
    </div>
  );
}
