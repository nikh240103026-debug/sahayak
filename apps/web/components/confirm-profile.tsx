"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { CircleAlert, CircleCheck, CircleHelp, FileText, PenLine } from "lucide-react";
import { confirmProfileAction, rereadAction, type ActionState } from "@/app/actions/runs";
import { Button, Card, Field, Input, Notice, Select } from "./ui";

export interface ConfirmField {
  key: string;
  label: string;
  help?: string;
  type: string;
  options?: string[];
  required: boolean;
  value: string;
  confidence: "high" | "medium" | "low" | null;
  sourceDocumentId: string | null;
  sourceLabel: string | null;
  rawValue: string | null;
}

const CONF_ICON = { high: CircleCheck, medium: CircleHelp, low: CircleAlert };

/** Confirm each field. Every value the agent may type comes from this screen. */
export function ConfirmProfile({ runId, fields, canReread }: { runId: string; fields: ConfirmField[]; canReread: boolean }) {
  const t = useTranslations("confirm");
  const tc = useTranslations("common");
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionState, FormData>(confirmProfileAction, {});

  useEffect(() => {
    if (state.ok) router.push(`/app/runs/${runId}?view=review`);
  }, [state.ok, router, runId]);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-3xl">{t("title")}</h2>
        <p className="max-w-2xl text-muted">{t("intro")}</p>
      </header>
      {state.fieldErrors && (
        <Notice tone="danger" role="alert">
          {t("needsFix")}
        </Notice>
      )}
      {state.error && (
        <Notice tone="danger" role="alert">
          {state.error}
        </Notice>
      )}
      <form action={action} className="space-y-4">
        <input type="hidden" name="runId" value={runId} />
        <div className="grid gap-4 md:grid-cols-2">
          {fields.map((f) => {
            const err = state.fieldErrors?.[f.key];
            const value = state.values?.[f.key] ?? f.value;
            const ConfIcon = f.confidence ? CONF_ICON[f.confidence] : null;
            const id = `f_${f.key}`;
            const describedBy = [f.help ? `${id}-hint` : null, err ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
            return (
              <Card key={f.key} className={err ? "border-danger p-4" : "p-4"}>
                <input type="hidden" name={`s_${f.key}`} value={f.sourceDocumentId ? `document:${f.sourceDocumentId}` : "manual"} />
                <Field
                  id={id}
                  label={
                    <span>
                      {f.label} {!f.required && <span className="font-normal text-muted">({tc("optional")})</span>}
                    </span>
                  }
                  hint={f.help}
                  error={err ? (err === "required" ? tc("required") : t("invalid", { help: f.help ?? "" })) : undefined}
                >
                  {f.type === "enum" && f.options ? (
                    <Select id={id} name={id} defaultValue={value} required={f.required} aria-invalid={Boolean(err)} aria-describedby={describedBy}>
                      <option value="">{t("selectPlaceholder")}</option>
                      {f.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      id={id}
                      name={id}
                      defaultValue={f.type === "date" && value ? value.split("-").reverse().join("/") : value}
                      required={f.required}
                      inputMode={["phone", "digits", "currency", "year"].includes(f.type) ? "numeric" : f.type === "percentage" ? "decimal" : f.type === "email" ? "email" : undefined}
                      placeholder={f.type === "date" ? "DD/MM/YYYY" : undefined}
                      aria-invalid={Boolean(err)}
                      aria-describedby={describedBy}
                      autoComplete="off"
                    />
                  )}
                </Field>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    {f.sourceLabel ? <FileText aria-hidden className="size-4" /> : <PenLine aria-hidden className="size-4" />}
                    {f.sourceLabel ? t("fromDocument", { doc: f.sourceLabel }) : t("typedByYou")}
                  </span>
                  {ConfIcon && f.confidence && (
                    <span className="inline-flex items-center gap-1.5">
                      <ConfIcon aria-hidden className={f.confidence === "high" ? "size-4 text-success" : "size-4 text-ink"} />
                      {t(f.confidence === "high" ? "confidenceHigh" : f.confidence === "medium" ? "confidenceMedium" : "confidenceLow")}
                    </span>
                  )}
                  {f.rawValue && <span>{t("readAs", { raw: f.rawValue })}</span>}
                </div>
              </Card>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? tc("saving") : t("confirmAll")}
          </Button>
        </div>
      </form>
      {canReread && (
        <form action={rereadAction}>
          <input type="hidden" name="runId" value={runId} />
          <Button type="submit" variant="ghost">
            {t("reread")}
          </Button>
        </form>
      )}
    </div>
  );
}
