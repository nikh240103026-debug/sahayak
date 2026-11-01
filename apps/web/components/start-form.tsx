"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { startRunAction, type ActionState } from "@/app/actions/runs";
import { Button, Notice } from "./ui";

/** Explicit, per-run authorisation before the assistant touches the portal. */
export function StartForm({ runId, label }: { runId: string; label?: string }) {
  const t = useTranslations("review");
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionState, FormData>(startRunAction, {});
  useEffect(() => {
    if (state.ok) router.replace(`/app/runs/${runId}`);
  }, [state.ok, router, runId]);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="runId" value={runId} />
      <label className="flex cursor-pointer gap-3 rounded-xl border-2 border-stamp/50 bg-paper p-4">
        <input type="checkbox" name="authorise" required className="mt-1 size-5 shrink-0 accent-[var(--primary)]" />
        <span className="font-medium">{t("authorise")}</span>
      </label>
      {state.error && (
        <Notice tone="danger" role="alert">
          {state.error}
        </Notice>
      )}
      <Button type="submit" size="lg" disabled={pending}>
        {label ?? t("start")}
      </Button>
    </form>
  );
}
