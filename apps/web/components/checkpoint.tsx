"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { KeyRound, MessageSquareText, ShieldCheck } from "lucide-react";
import { controlRunAction, resolveApprovalAction, type ActionState } from "@/app/actions/runs";
import type { ApprovalView } from "@/lib/run-state";
import { Button, Field, Input, Notice } from "./ui";

function DemoInbox({ runId }: { runId: string }) {
  const t = useTranslations("checkpoint");
  const [sms, setSms] = useState<{ text: string; sentAt: string } | null>(null);
  useEffect(() => {
    let stop = false;
    const load = async () => {
      const res = await fetch(`/api/runs/${runId}/demo-sms`, { cache: "no-store" }).catch(() => null);
      if (res?.ok && !stop) setSms(((await res.json()) as { sms: typeof sms }).sms);
    };
    void load();
    const timer = setInterval(load, 3000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [runId]);
  return (
    <div className="rounded-xl border border-dashed border-primary/50 bg-primary/5 p-4">
      <p className="flex items-center gap-2 font-semibold">
        <MessageSquareText aria-hidden className="size-5 text-primary" /> {t("otpDemoInbox")}
      </p>
      <p className="text-sm text-muted">{t("otpDemoInboxNote")}</p>
      <p className="mt-2 font-mono text-[0.95rem]" aria-live="polite">
        {sms ? sms.text : t("otpNoMessage")}
      </p>
    </div>
  );
}

/** The human checkpoint: explains why, shows exactly what is needed, and records the decision. */
export function Checkpoint({ runId, approval, onResolved }: { runId: string; approval: ApprovalView; onResolved: () => void }) {
  const t = useTranslations("checkpoint");
  const tr = useTranslations("run");
  const locale = useLocale() as "en" | "hi";
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState<ActionState, FormData>(resolveApprovalAction, {});

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, [approval.id]);

  useEffect(() => {
    if (state.ok) {
      dialog.current?.close();
      onResolved();
    }
  }, [state.ok, onResolved]);

  const isFinal = approval.kind === "final_submit";
  const titleId = `checkpoint-${approval.id}`;

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(e) => e.preventDefault()}
      className="m-auto max-h-[92dvh] w-[min(46rem,calc(100vw-2rem))] overflow-auto rounded-[18px] border border-line bg-surface p-0 text-ink shadow-lift backdrop:bg-ink/50"
    >
      <div className="space-y-5 p-5 sm:p-7">
        <header className="flex items-start gap-3">
          {isFinal ? (
            <ShieldCheck aria-hidden className="mt-1 size-7 shrink-0 text-stamp" />
          ) : (
            <KeyRound aria-hidden className="mt-1 size-7 shrink-0 text-accent" />
          )}
          <div className="space-y-1">
            <h2 id={titleId} className="text-2xl">
              {isFinal ? t("finalTitle") : approval.kind === "captcha" ? t("captchaTitle") : t("otpTitle")}
            </h2>
            <p className="text-muted">{isFinal ? t("finalWhy") : approval.kind === "captcha" ? t("captchaWhy") : t("otpWhy")}</p>
          </div>
        </header>

        {state.error && (
          <Notice tone="danger" role="alert">
            {state.error}
          </Notice>
        )}

        {isFinal ? (
          <form action={action} className="space-y-5">
            <input type="hidden" name="runId" value={runId} />
            <input type="hidden" name="approvalId" value={approval.id} />
            {approval.mismatches && approval.mismatches.length > 0 && (
              <Notice tone="warning" role="alert">
                {t("mismatch", { list: approval.mismatches.join(", ") })}
              </Notice>
            )}
            <div className="space-y-4">
              {approval.sections?.map((s) => (
                <section key={s.id} aria-labelledby={`sec-${s.id}`} className="rounded-xl border border-line">
                  <h3 id={`sec-${s.id}`} className="border-b border-line bg-paper px-4 py-2 font-sans text-base font-semibold">
                    {s.title[locale]}
                  </h3>
                  <dl className="divide-y divide-line">
                    {s.entries.map((e) => (
                      <div key={e.label.en} className="grid gap-1 px-4 py-2 sm:grid-cols-[0.9fr_1.1fr]">
                        <dt className="text-sm text-muted">{e.label[locale]}</dt>
                        <dd className="font-medium break-words">{e.value}</dd>
                      </div>
                    ))}
                    {s.uploads.map((u) => (
                      <div key={u.en} className="grid gap-1 px-4 py-2 sm:grid-cols-[0.9fr_1.1fr]">
                        <dt className="text-sm text-muted">{u[locale]}</dt>
                        <dd className="font-medium">✓</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
            <p className="text-sm">{t("declaration")}</p>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" name="decision" value="approved" variant="stamp" size="lg" disabled={pending}>
                {t("approve")}
              </Button>
              <Button type="submit" name="decision" value="rejected" variant="secondary" size="lg" disabled={pending}>
                {t("goBack")}
              </Button>
            </div>
          </form>
        ) : (
          <form action={action} className="space-y-5">
            <input type="hidden" name="runId" value={runId} />
            <input type="hidden" name="approvalId" value={approval.id} />
            <input type="hidden" name="decision" value="provided" />
            {approval.prompt && (
              <div className="rounded-xl border border-line bg-paper p-4">
                <p className="text-sm text-muted">{t("portalSays")}</p>
                <p className="mt-1 text-lg font-semibold">{approval.prompt}</p>
              </div>
            )}
            {approval.kind === "otp" && <DemoInbox runId={runId} />}
            <Field id={`resp-${approval.id}`} label={approval.kind === "captcha" ? t("captchaLabel") : t("otpLabel")}>
              <Input
                id={`resp-${approval.id}`}
                name="response"
                required
                maxLength={approval.kind === "otp" ? 6 : 8}
                inputMode="numeric"
                autoComplete={approval.kind === "otp" ? "one-time-code" : "off"}
                autoFocus
              />
            </Field>
            <p className="text-sm text-muted">{t("expiresIn")}</p>
            <Button type="submit" disabled={pending}>
              {pending ? t("sent") : t("send")}
            </Button>
          </form>
        )}

        <form action={controlRunAction} className="border-t border-line pt-4">
          <input type="hidden" name="runId" value={runId} />
          <input type="hidden" name="control" value="cancel" />
          <Button type="submit" variant="ghost" size="sm">
            {tr("cancelRun")}
          </Button>
        </form>
      </div>
    </dialog>
  );
}
