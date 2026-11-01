import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { CheckCircle2, KeyRound, Trash2, XCircle } from "lucide-react";
import { brand } from "@app/shared/brand";
import { HandStep, PaperStack } from "@/components/illustrations";
import { Underlined } from "@/components/motifs";
import { buttonStyles, Card } from "@/components/ui";

const RETENTION = Number(process.env.RETENTION_HOURS ?? 24) || 24;

export default async function Landing() {
  const t = await getTranslations("landing");
  const locale = (await getLocale()) as "en" | "hi";
  const steps = [1, 2, 3] as const;
  const trust = [
    { icon: CheckCircle2, title: t("trust1Title"), body: t("trust1Body") },
    { icon: KeyRound, title: t("trust2Title"), body: t("trust2Body") },
    { icon: Trash2, title: t("trust3Title"), body: t("trust3Body", { hours: RETENTION }) },
  ];

  return (
    <div className="space-y-20">
      <section className="grid items-center gap-10 md:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-6">
          <p className="text-sm font-semibold tracking-wide text-primary uppercase">{t("eyebrow")}</p>
          <h1 className="text-4xl leading-[1.1] sm:text-5xl">
            {t("titleLead")} <Underlined>{t("titleEmphasis")}</Underlined>
          </h1>
          <p className="max-w-xl text-lg text-muted">{t("intro")}</p>
          <p className="font-serif text-xl text-ink italic">{brand.tagline[locale]}</p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href="/signup" className={buttonStyles({ size: "lg" })}>
              {t("ctaStart")}
            </Link>
            <Link href="/demo-portal" className={buttonStyles({ variant: "secondary", size: "lg" })}>
              {t("ctaDemo")}
            </Link>
          </div>
          <p className="text-sm text-muted">{t("demoNote")}</p>
        </div>
        <div className="relative hidden justify-self-center md:block">
          <div className="card rotate-2 p-8">
            <PaperStack className="h-48 w-56" />
          </div>
        </div>
      </section>

      <section aria-labelledby="how" className="space-y-8">
        <h2 id="how" className="text-3xl">
          {t("stepsTitle")}
        </h2>
        <ol className="grid gap-5 md:grid-cols-3">
          {steps.map((n) => (
            <li key={n}>
              <Card className="h-full space-y-3">
                <HandStep n={n} />
                <h3 className="text-xl">{t(`step${n}Title`)}</h3>
                <p className="text-muted">{t(`step${n}Body`)}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="trust" className="grid gap-8 md:grid-cols-[0.8fr_1.2fr]">
        <h2 id="trust" className="text-3xl">
          {t("trustTitle")}
        </h2>
        <ul className="space-y-5">
          {trust.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-4">
              <Icon aria-hidden className="mt-1 size-6 shrink-0 text-success" />
              <div>
                <p className="font-semibold">{title}</p>
                <p className="text-muted">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="limits">
        <Card className="space-y-4 border-dashed bg-paper">
          <h2 id="limits" className="text-2xl">
            {t("limitsTitle")}
          </h2>
          <ul className="space-y-3">
            {[t("limits1"), t("limits2"), t("limits3"), t("limits4")].map((line) => (
              <li key={line} className="flex gap-3">
                <XCircle aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}
