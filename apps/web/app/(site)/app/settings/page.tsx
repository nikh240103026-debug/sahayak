import { cookies } from "next/headers";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Download } from "lucide-react";
import { CONSENT_PURPOSES, type ConsentPurpose } from "@app/shared";
import { setLocaleAction, setThemeAction } from "@/app/actions/preferences";
import { setConsentAction } from "@/app/actions/settings";
import { DeleteAccount } from "@/components/delete-account";
import { Button, Card, Notice, PageTitle, buttonStyles, cn } from "@/components/ui";
import { requireOnboarded } from "@/lib/auth";
import { consentHistory, loadConsents } from "@/lib/data";
import { env } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "Settings and privacy" };

const TITLES: Record<ConsentPurpose, { title: string; body: string }> = {
  store_profile: { title: "consentStore", body: "consentStoreBody" },
  ai_processing: { title: "consentAi", body: "consentAiBody" },
  agent_actions: { title: "consentAgent", body: "consentAgentBody" },
};

export default async function Settings() {
  const { user } = await requireOnboarded("/app/settings");
  const t = await getTranslations("settings");
  const to = await getTranslations("onboarding");
  const tc = await getTranslations("common");
  const format = await getFormatter();
  const locale = await getLocale();
  const theme = (await cookies()).get("theme")?.value ?? "system";
  const sb = await supabaseServer();
  const [consents, history] = await Promise.all([loadConsents(sb, user.id), consentHistory(sb, user.id)]);
  const when = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="space-y-8">
      <PageTitle title={t("title")} intro={t("retentionNote", { hours: env().RETENTION_HOURS })} />

      <Card className="space-y-5">
        <div>
          <h2 className="text-2xl">{t("consentsTitle")}</h2>
          <p className="text-muted">{t("consentsIntro")}</p>
        </div>
        <ul className="space-y-3">
          {CONSENT_PURPOSES.map((p) => {
            const on = consents[p].granted;
            return (
              <li key={p} className="flex flex-col gap-3 rounded-xl border border-line bg-paper p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="font-semibold">
                    {to(TITLES[p].title)}{" "}
                    <span className={cn("ml-1 rounded-full border px-2 py-0.5 text-sm", on ? "border-success/50 text-success" : "border-line text-muted")}>
                      {on ? t("on") : t("off")}
                    </span>
                  </p>
                  <p className="text-sm text-muted">{to(TITLES[p].body)}</p>
                  {p === "store_profile" && on && <p className="text-sm">{t("storeOffWarning")}</p>}
                </div>
                <form action={setConsentAction}>
                  <input type="hidden" name="purpose" value={p} />
                  <input type="hidden" name="granted" value={on ? "false" : "true"} />
                  <Button type="submit" variant={on ? "secondary" : "primary"} size="sm">
                    {on ? t("turnOff") : t("turnOn")}
                  </Button>
                </form>
              </li>
            );
          })}
        </ul>
        <details className="rounded-xl border border-line p-4">
          <summary className="cursor-pointer font-semibold">{t("history")}</summary>
          <ul className="mt-3 space-y-1 font-mono text-sm">
            {history.map((h, i) => (
              <li key={i}>
                {when(h.created_at)} · {to(TITLES[h.purpose].title)} · {h.granted ? t("granted") : t("withdrawn")} · v{h.notice_version}
              </li>
            ))}
          </ul>
        </details>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="space-y-4">
          <h2 className="text-2xl">{t("languageTitle")}</h2>
          <form action={setLocaleAction} className="flex gap-2">
            {(["en", "hi"] as const).map((l) => (
              <Button key={l} type="submit" name="locale" value={l} variant={locale === l ? "primary" : "secondary"} aria-pressed={locale === l} lang={l}>
                {l === "en" ? tc("english") : tc("hindi")}
              </Button>
            ))}
          </form>
        </Card>
        <Card className="space-y-4">
          <h2 className="text-2xl">{t("themeTitle")}</h2>
          <form action={setThemeAction} className="flex flex-wrap gap-2">
            {(["system", "light", "dark"] as const).map((v) => (
              <Button key={v} type="submit" name="theme" value={v} variant={theme === v ? "primary" : "secondary"} aria-pressed={theme === v}>
                {v === "system" ? tc("themeSystem") : v === "light" ? tc("themeLight") : tc("themeDark")}
              </Button>
            ))}
          </form>
        </Card>
      </div>

      <Card className="space-y-3">
        <h2 className="text-2xl">{t("exportTitle")}</h2>
        <p className="text-muted">{t("exportBody")}</p>
        <a href="/api/account/export" className={buttonStyles({ variant: "secondary", className: "w-fit" })}>
          <Download aria-hidden className="size-4" /> {t("exportButton")}
        </a>
      </Card>

      <Card className="space-y-3 border-danger/40">
        <h2 className="text-2xl">{t("deleteTitle")}</h2>
        <Notice tone="danger">{t("deleteBody")}</Notice>
        <DeleteAccount />
      </Card>
    </div>
  );
}
