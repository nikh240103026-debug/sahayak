"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, Ban, CheckCircle2, Hand, Info, RotateCcw } from "lucide-react";
import type { RunStatus } from "@app/shared";
import { controlRunAction } from "@/app/actions/runs";
import type { RunStateView, StepView } from "@/lib/run-state";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Checkpoint } from "./checkpoint";
import { SlideIn, Stamp, ThinkingDot } from "./motifs";
import { StatusBadge } from "./status-badge";
import { Button, Card, Notice, buttonStyles, cn } from "./ui";

const ACTIVE: RunStatus[] = ["QUEUED", "EXTRACTING", "PLANNING", "EXECUTING", "AWAITING_HUMAN", "AWAITING_FINAL_APPROVAL", "SUBMITTING"];
const SETTLED: RunStatus[] = ["NEEDS_PROFILE_CONFIRM", "FAILED", "CANCELLED", "PAUSED_EXPIRED", "COMPLETED"];

const RESULT_ICON = { ok: CheckCircle2, error: AlertTriangle, retry: RotateCcw, blocked: Ban, info: Info, waiting: Hand };
const RESULT_TONE = { ok: "text-success", error: "text-danger", retry: "text-ink", blocked: "text-stamp", info: "text-muted", waiting: "text-ink" };

function useRunState(runId: string, initial: RunStateView) {
  const [state, setState] = useState(initial);
  const [realtime, setRealtime] = useState<"connecting" | "live" | "down">("connecting");
  const inflight = useRef(false);

  const refresh = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const res = await fetch(`/api/runs/${runId}/state`, { cache: "no-store" });
      if (res.ok) setState((await res.json()) as RunStateView);
    } finally {
      inflight.current = false;
    }
  }, [runId]);

  // Live progress over Supabase Realtime (RLS-protected); polling is the fallback.
  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof supabaseBrowser>["channel"]> | null = null;
    try {
      const sb = supabaseBrowser();
      channel = sb
        .channel(`run-${runId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "run_steps", filter: `run_id=eq.${runId}` }, () => void refresh())
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "runs", filter: `id=eq.${runId}` }, () => void refresh())
        .on("postgres_changes", { event: "*", schema: "public", table: "approvals", filter: `run_id=eq.${runId}` }, () => void refresh())
        .subscribe((status) => {
          if (status === "SUBSCRIBED") setRealtime("live");
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setRealtime("down");
        });
    } catch {
      void Promise.resolve().then(() => setRealtime("down"));
    }
    return () => {
      if (channel) void supabaseBrowser().removeChannel(channel);
    };
  }, [runId, refresh]);

  const active = ACTIVE.includes(state.status);
  useEffect(() => {
    if (!active) return;
    const every = realtime === "live" ? 10_000 : 2_000;
    const timer = setInterval(() => void refresh(), every);
    return () => clearInterval(timer);
  }, [active, realtime, refresh]);

  return { state, refresh, realtime };
}

function groupSteps(steps: StepView[]) {
  const groups: Array<{ stepId: string | null; items: StepView[] }> = [];
  for (const s of steps) {
    const last = groups[groups.length - 1];
    if (last && last.stepId === s.step_id) last.items.push(s);
    else groups.push({ stepId: s.step_id, items: [s] });
  }
  return groups;
}

export function RunView({ runId, initial, warmingUp }: { runId: string; initial: RunStateView; warmingUp: boolean }) {
  const t = useTranslations("run");
  const ts = useTranslations("status");
  const tw = useTranslations("wizard");
  const locale = useLocale() as "en" | "hi";
  const router = useRouter();
  const { state, refresh, realtime } = useRunState(runId, initial);
  const [showLog, setShowLog] = useState(false);
  const prevStatus = useRef(state.status);

  // When the run settles into a state with its own screen, let the server re-render the page.
  useEffect(() => {
    if (prevStatus.current !== state.status && SETTLED.includes(state.status)) router.refresh();
    prevStatus.current = state.status;
  }, [state.status, router]);

  const groups = useMemo(() => groupSteps(state.steps), [state.steps]);
  const latest = state.steps[state.steps.length - 1];
  const title = (id: string | null) =>
    id ? (state.stepTitles[id]?.[locale] ?? (id === "extract" ? tw("reading") : id)) : t("live");
  const isActive = ACTIVE.includes(state.status);
  const reading = state.status === "QUEUED" || state.status === "EXTRACTING";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <StatusBadge status={state.status} label={ts(state.status)} />
          {isActive && (
            <span className="inline-flex items-center gap-2 text-sm text-muted">
              <ThinkingDot /> {t("thinking")}
            </span>
          )}
        </div>
        {isActive && !reading && state.status !== "SUBMITTING" && (
          <div className="flex flex-wrap gap-2">
            <form action={controlRunAction}>
              <input type="hidden" name="runId" value={runId} />
              <input type="hidden" name="control" value={state.control === "pause" ? "none" : "pause"} />
              <Button type="submit" variant="secondary" size="sm">
                {state.control === "pause" ? t("resume") : t("pause")}
              </Button>
            </form>
            <form
              action={controlRunAction}
              onSubmit={(e) => {
                if (!window.confirm(t("cancelConfirm"))) e.preventDefault();
              }}
            >
              <input type="hidden" name="runId" value={runId} />
              <input type="hidden" name="control" value="cancel" />
              <Button type="submit" variant="danger" size="sm">
                {t("cancelRun")}
              </Button>
            </form>
          </div>
        )}
      </div>

      {realtime === "down" && isActive && <Notice tone="info">{t("connection")}</Notice>}

      {reading && (
        <Notice tone="info" role="status" title={state.status === "QUEUED" || warmingUp ? tw("warmingUp") : tw("reading")}>
          {state.status === "QUEUED" ? tw("warmingUpBody") : tw("readingBody")}
        </Notice>
      )}

      {state.status === "COMPLETED" && (
        <Card className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Stamp label={t("submittedTitle")} size="lg" />
          </div>
          <Link href={`/app/runs/${runId}/receipt`} className={buttonStyles({})}>
            {t("goToReceipt")}
          </Link>
        </Card>
      )}

      {/* Screen-reader friendly live announcement of the newest step. */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {latest ? `${latest.target_label ?? latest.action}: ${latest.message ?? t(`result.${latest.result}`)}` : ""}
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section aria-labelledby="timeline" className="space-y-3">
          <h2 id="timeline" className="text-xl">
            {t("timeline")}
          </h2>
          <ol className="relative space-y-3 border-l-2 border-dashed border-line pl-5">
            {groups.map((g, gi) => {
              const last = g.items[g.items.length - 1]!;
              const done = g.items.some((i) => i.action === "step_done" || i.action === "receipt");
              const Icon = RESULT_ICON[done ? "ok" : last.result];
              return (
                <li key={`${g.stepId}-${gi}`}>
                  <SlideIn>
                    <div className="card relative p-4">
                      <span className="absolute top-5 -left-[1.95rem] flex size-5 items-center justify-center rounded-full border-2 border-line bg-paper">
                        <Icon aria-hidden className={cn("size-3.5", RESULT_TONE[done ? "ok" : last.result])} />
                      </span>
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold">{title(g.stepId)}</p>
                        {done ? <Stamp label={t("done")} size="sm" /> : <span className="text-sm text-muted">{t(`result.${last.result}`)}</span>}
                      </div>
                      {last.message && <p className="mt-1 text-sm text-muted">{last.message}</p>}
                    </div>
                  </SlideIn>
                </li>
              );
            })}
          </ol>
        </section>

        <section aria-labelledby="shot" className="space-y-3">
          <h2 id="shot" className="text-xl">
            {t("latestScreenshot")}
          </h2>
          <Card className="overflow-hidden p-2">
            {state.latestScreenshot ? (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage
              <img
                src={state.latestScreenshot.url}
                alt={t("screenshotAlt", { step: state.latestScreenshot.label ?? state.latestScreenshot.seq })}
                className="w-full rounded-lg"
                loading="lazy"
              />
            ) : (
              <p className="p-6 text-center text-muted">{t("noScreenshot")}</p>
            )}
          </Card>
        </section>
      </div>

      <section aria-labelledby="audit">
        <div className="flex items-center justify-between">
          <h2 id="audit" className="text-xl">
            {t("auditLog")}
          </h2>
          <Button variant="ghost" size="sm" onClick={() => setShowLog((v) => !v)} aria-expanded={showLog} aria-controls="audit-log">
            {showLog ? t("hideLog") : t("showLog")}
          </Button>
        </div>
        <p className="text-sm text-muted">{t("auditIntro")}</p>
        {showLog && (
          <div id="audit-log" className="mt-3 max-h-80 overflow-auto rounded-xl border border-line bg-surface p-3 font-mono text-[0.8rem] leading-relaxed">
            <table className="w-full border-collapse">
              <tbody>
                {state.steps.map((s) => (
                  <tr key={s.seq} className="align-top">
                    <td className="pr-3 whitespace-nowrap text-muted">{new Date(s.created_at).toLocaleTimeString(locale === "hi" ? "hi-IN" : "en-IN")}</td>
                    <td className="pr-3 whitespace-nowrap">{s.action}</td>
                    <td className="pr-3">{s.target_label ?? ""}</td>
                    <td className="pr-3">{s.value_redacted ?? ""}</td>
                    <td className="pr-3 whitespace-nowrap">{t(`result.${s.result}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {state.llmCalls > 0 && <p className="mt-2 text-sm text-muted">{t("usage", { calls: state.llmCalls })}</p>}
      </section>

      {state.approval && (state.status === "AWAITING_HUMAN" || state.status === "AWAITING_FINAL_APPROVAL") && (
        <Checkpoint runId={runId} approval={state.approval} onResolved={refresh} />
      )}
    </div>
  );
}
