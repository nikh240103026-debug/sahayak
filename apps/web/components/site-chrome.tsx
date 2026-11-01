import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { brand } from "@app/shared/brand";
import { setLocaleAction } from "@/app/actions/preferences";
import { currentUser } from "@/lib/auth";
import { cn } from "./ui";

function BrandMark() {
  return (
    <svg aria-hidden viewBox="0 0 32 32" className="size-8">
      <rect x="4" y="5" width="22" height="24" rx="4" fill="var(--surface)" stroke="var(--ink)" strokeWidth="2" />
      <path d="M9 12h12M9 17h9" stroke="var(--line)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M9 22c3-2 6 2 9-1" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <circle cx="25" cy="24" r="5" fill="var(--paper)" stroke="var(--stamp)" strokeWidth="2" />
      <path d="M23 24l1.5 1.5L27 23" stroke="var(--stamp)" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export async function LanguageToggle() {
  const locale = await getLocale();
  const t = await getTranslations("common");
  return (
    <form action={setLocaleAction} className="flex items-center rounded-xl border border-line bg-surface p-0.5" aria-label={t("language")}>
      {(["en", "hi"] as const).map((l) => (
        <button
          key={l}
          type="submit"
          name="locale"
          value={l}
          lang={l}
          aria-pressed={locale === l}
          className={cn(
            "min-h-10 min-w-11 rounded-lg px-2.5 text-sm font-semibold",
            locale === l ? "bg-ink text-paper" : "text-ink hover:bg-paper",
          )}
        >
          {l === "en" ? "EN" : "हिं"}
          <span className="sr-only">{l === "en" ? t("english") : t("hindi")}</span>
        </button>
      ))}
    </form>
  );
}

export async function SiteHeader() {
  const t = await getTranslations("nav");
  const tc = await getTranslations("common");
  const user = await currentUser().catch(() => null);
  return (
    <header className="border-b border-line/70 bg-paper/90 backdrop-blur-sm">
      <a href="#main" className="skip-link">
        {tc("skipToContent")}
      </a>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href={user ? "/app" : "/"} className="flex items-center gap-2.5 text-ink no-underline">
          <BrandMark />
          <span className="font-serif text-xl font-semibold">{brand.name}</span>
        </Link>
        <nav aria-label={t("menu")} className="flex flex-wrap items-center gap-1.5 sm:gap-3">
          {user ? (
            <>
              <Link href="/app" className="rounded-lg px-2 py-2 font-medium text-ink no-underline hover:bg-surface">
                {t("dashboard")}
              </Link>
              <Link href="/app/settings" className="rounded-lg px-2 py-2 font-medium text-ink no-underline hover:bg-surface">
                {t("settings")}
              </Link>
              <form action="/auth/signout" method="post">
                <button type="submit" className="min-h-11 rounded-lg px-2 font-medium text-primary hover:underline">
                  {t("signOut")}
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/signin" className="rounded-lg px-2 py-2 font-medium text-ink no-underline hover:bg-surface">
                {t("signIn")}
              </Link>
              <Link href="/signup" className="rounded-xl bg-primary px-3.5 py-2 font-semibold text-on-primary no-underline">
                {t("signUp")}
              </Link>
            </>
          )}
          <LanguageToggle />
        </nav>
      </div>
    </header>
  );
}

export async function SiteFooter() {
  const t = await getTranslations("footer");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as "en" | "hi";
  return (
    <footer className="mt-16 border-t border-line/70">
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-8 text-sm text-muted sm:px-6">
        <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/privacy">{t("privacy")}</Link>
          <Link href="/terms">{t("terms")}</Link>
          <Link href="/disclaimer">{t("disclaimer")}</Link>
          <Link href="/ai-use">{t("aiUse")}</Link>
          <Link href="/grievance">{t("grievance")}</Link>
        </nav>
        <p className="font-medium text-ink">{brand.notAffiliated[locale]}</p>
        <p>{tc("notLegalAdvice")}</p>
        <p>
          © {new Date().getFullYear()} {brand.legalEntityName}. {t("madeWith")}
        </p>
      </div>
    </footer>
  );
}
