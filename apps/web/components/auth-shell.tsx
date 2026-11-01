import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { PaperStack } from "./illustrations";

/** Split layout for sign-in/up pages: a short, warm side panel and the form. */
export async function AuthShell({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  const t = await getTranslations("auth");
  return (
    <div className="mx-auto grid max-w-5xl overflow-hidden rounded-[18px] border border-line bg-surface shadow-lift md:grid-cols-2">
      <aside className="hidden flex-col justify-between gap-8 bg-paper p-10 md:flex">
        <PaperStack />
        <div className="space-y-3">
          <p className="font-serif text-2xl leading-snug">{t("sideTitle")}</p>
          <p className="text-muted">{t("sideBody")}</p>
        </div>
      </aside>
      <section className="space-y-6 p-6 sm:p-10">
        <header className="space-y-2">
          <h1 className="text-3xl">{title}</h1>
          <p className="text-muted">{intro}</p>
        </header>
        {children}
      </section>
    </div>
  );
}
