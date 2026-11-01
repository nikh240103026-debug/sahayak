"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createRunAction, type ActionState } from "@/app/actions/runs";
import { Button, Notice } from "./ui";

/** Create the application: read documents with AI (if allowed) or type details yourself. */
export function BeginForm({ slug, aiAllowed, ready }: { slug: string; aiAllowed: boolean; ready: boolean }) {
  const t = useTranslations("wizard");
  const [state, action, pending] = useActionState<ActionState, FormData>(createRunAction, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <label className="flex cursor-pointer gap-3 rounded-xl border border-line bg-paper p-4">
        <input type="checkbox" name="chaos" defaultChecked className="mt-1 size-5 shrink-0 accent-[var(--primary)]" />
        <span>
          <span className="block font-semibold">{t("practiceMode")}</span>
          <span className="block text-sm text-muted">{t("practiceModeHint")}</span>
        </span>
      </label>
      {!aiAllowed && <Notice tone="info">{t("aiOff")}</Notice>}
      {state.error && (
        <Notice tone="danger" role="alert">
          {state.error}
        </Notice>
      )}
      <div className="flex flex-wrap gap-3">
        {aiAllowed && (
          <Button type="submit" name="mode" value="ai" disabled={!ready || pending}>
            {t("readWithAi")}
          </Button>
        )}
        <Button type="submit" name="mode" value="manual" variant={aiAllowed ? "secondary" : "primary"} disabled={!ready || pending}>
          {t("typeMyself")}
        </Button>
      </div>
    </form>
  );
}
