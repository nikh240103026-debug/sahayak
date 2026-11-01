import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, FilePlus2 } from "lucide-react";
import type { RunStatus } from "@app/shared";
import { getBundledService } from "@app/shared/services";
import { EmptyFolder } from "@/components/illustrations";
import { Stamp } from "@/components/motifs";
import { StatusBadge } from "@/components/status-badge";
import { Card, buttonStyles } from "@/components/ui";
import { requireOnboarded } from "@/lib/auth";
import { loadProfile } from "@/lib/data";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "My applications" };

interface RunListRow {
  id: string;
  service_slug: string;
  status: RunStatus;
  created_at: string;
  finished_at: string | null;
  receipts: Array<{ tracking_id: string }> | null;
}

export default async function Dashboard() {
  const { user } = await requireOnboarded("/app");
  const t = await getTranslations("dashboard");
  const ts = await getTranslations("status");
  const format = await getFormatter();
  const locale = (await getLocale()) as "en" | "hi";
  const sb = await supabaseServer();
  const [profile, { data }] = await Promise.all([
    loadProfile(sb, user.id),
    sb
      .from("runs")
      .select("id,service_slug,status,created_at,finished_at,receipts(tracking_id)")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  const runs = (data ?? []) as RunListRow[];
  const active = runs.filter((r) => r.status !== "COMPLETED" && r.status !== "CANCELLED");
  const done = runs.filter((r) => r.status === "COMPLETED");
  const firstName = profile.full_name?.value.split(" ")[0];
  const serviceName = (slug: string) => getBundledService(slug)?.name[locale] ?? slug;
  const date = (iso: string) => format.dateTime(new Date(iso), { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl sm:text-4xl">{firstName ? t("greeting", { name: firstName }) : t("greetingNoName")}</h1>
        <p className="text-lg text-muted">{t("intro")}</p>
      </header>

      <Card className="flex flex-col gap-4 border-primary/40 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <FilePlus2 aria-hidden className="mt-1 size-8 shrink-0 text-primary" />
          <div>
            <h2 className="text-xl">{t("startTitle")}</h2>
            <p className="text-muted">{t("startBody")}</p>
          </div>
        </div>
        <Link href="/app/new" className={buttonStyles({})}>
          {t("startButton")} <ArrowRight aria-hidden className="size-4" />
        </Link>
      </Card>

      <section aria-labelledby="in-progress" className="space-y-4">
        <h2 id="in-progress" className="text-2xl">
          {t("inProgress")}
        </h2>
        {active.length === 0 ? (
          <div className="flex items-center gap-4 text-muted">
            <EmptyFolder />
            <p>{t("emptyInProgress")}</p>
          </div>
        ) : (
          <ul className="grid gap-3">
            {active.map((r) => (
              <li key={r.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="space-y-1">
                    <p className="font-semibold">{serviceName(r.service_slug)}</p>
                    <p className="text-sm text-muted">{t("started", { date: date(r.created_at) })}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={r.status} label={ts(r.status)} />
                    <Link href={`/app/runs/${r.id}`} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                      {t("open")}
                    </Link>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="receipts" className="space-y-4">
        <h2 id="receipts" className="text-2xl">
          {t("pastReceipts")}
        </h2>
        {done.length === 0 ? (
          <div className="flex items-center gap-4 text-muted">
            <EmptyFolder />
            <p>{t("emptyReceipts")}</p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {done.map((r) => (
              <li key={r.id}>
                <Card className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold">{serviceName(r.service_slug)}</p>
                    <Stamp label={ts("COMPLETED")} size="sm" />
                  </div>
                  <p className="font-mono text-lg">{r.receipts?.[0]?.tracking_id ?? "-"}</p>
                  <p className="text-sm text-muted">{t("submitted", { date: date(r.finished_at ?? r.created_at) })}</p>
                  <Link href={`/app/runs/${r.id}/receipt`} className={buttonStyles({ variant: "ghost", size: "sm" })}>
                    {t("viewReceipt")}
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
