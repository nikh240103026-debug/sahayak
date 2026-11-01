import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Download, ExternalLink } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { Stamp } from "@/components/motifs";
import { Card, Notice, buttonStyles } from "@/components/ui";
import { requireOnboarded } from "@/lib/auth";
import { getService } from "@/lib/data";
import { getOwnRun } from "@/lib/runs";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "Receipt" };

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireOnboarded(`/app/runs/${id}/receipt`);
  const run = await getOwnRun(user.id, id);
  if (!run) notFound();
  const sb = await supabaseServer();
  const { data } = await sb
    .from("receipts")
    .select("tracking_id,summary_en,summary_hi,receipt_pdf_key,created_at")
    .eq("run_id", run.id)
    .maybeSingle();
  const receipt = data as { tracking_id: string; summary_en: string; summary_hi: string; receipt_pdf_key: string | null } | null;
  if (!receipt) notFound();
  const t = await getTranslations("receipt");
  const locale = (await getLocale()) as "en" | "hi";
  const service = await getService(sb, run.service_slug);

  const { data: shots } = await sb
    .from("run_steps")
    .select("seq,target_label,screenshot_key")
    .eq("run_id", run.id)
    .not("screenshot_key", "is", null)
    .order("seq");
  const keys = ((shots ?? []) as Array<{ seq: number; target_label: string | null; screenshot_key: string }>).slice(-12);
  const signed = keys.length
    ? ((await sb.storage.from("run-artifacts").createSignedUrls(keys.map((k) => k.screenshot_key), 300)).data ?? [])
    : [];

  return (
    <div className="space-y-8">
      <Card className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl">{t("title")}</h1>
            <p className="text-muted">{service?.name[locale]}</p>
          </div>
          <Stamp label={locale === "hi" ? "जमा" : "Submitted"} size="lg" />
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-paper p-4">
          <div>
            <p className="text-sm text-muted">{t("trackingId")}</p>
            <p className="font-mono text-2xl font-bold tracking-wide">{receipt.tracking_id}</p>
          </div>
          <CopyButton value={receipt.tracking_id} label={t("trackingId")} />
        </div>
        <p>{t("statusExplain")}</p>
        <section aria-labelledby="summary" className="space-y-2">
          <h2 id="summary" className="text-xl">
            {t("summary")}
          </h2>
          <p lang="en">{receipt.summary_en}</p>
          <p lang="hi" className="font-hindi">
            {receipt.summary_hi}
          </p>
        </section>
        <Notice tone="warning">{t("noGuarantee")}</Notice>
        <div className="flex flex-wrap gap-3">
          {receipt.receipt_pdf_key && (
            <a href={`/api/runs/${run.id}/receipt-pdf`} className={buttonStyles({})}>
              <Download aria-hidden className="size-4" /> {t("downloadPdf")}
            </a>
          )}
          <Link href="/demo-portal/status" className={buttonStyles({ variant: "secondary" })}>
            <ExternalLink aria-hidden className="size-4" /> {t("checkStatus")}
          </Link>
          <Link href="/app" className={buttonStyles({ variant: "ghost" })}>
            {t("back")}
          </Link>
        </div>
      </Card>

      {signed.length > 0 && (
        <section aria-labelledby="gallery" className="space-y-3">
          <h2 id="gallery" className="text-2xl">
            {t("screenshots")}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {signed.map((s, i) =>
              s.signedUrl ? (
                <li key={s.path ?? i}>
                  <figure className="card overflow-hidden p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                    <img src={s.signedUrl} alt={`${keys[i]?.target_label ?? ""} (${i + 1})`} loading="lazy" className="w-full rounded-lg" />
                    <figcaption className="px-1 pt-2 text-sm text-muted">
                      {i + 1}. {keys[i]?.target_label}
                    </figcaption>
                  </figure>
                </li>
              ) : null,
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
