"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { isAdult, normalizeDate } from "@app/shared";
import { completeOnboardingAction, type OnboardingState } from "@/app/actions/onboarding";
import { Button, Card, Field, Input, Notice } from "./ui";

const CONSENTS = [
  { purpose: "store_profile", title: "consentStore", body: "consentStoreBody" },
  { purpose: "ai_processing", title: "consentAi", body: "consentAiBody" },
  { purpose: "agent_actions", title: "consentAgent", body: "consentAgentBody" },
] as const;

/** Three small steps: about you, language, permissions. All fields are submitted together at the end. */
export function OnboardingWizard({ locale, noticeVersion }: { locale: "en" | "hi"; noticeVersion: string }) {
  const t = useTranslations("onboarding");
  const tc = useTranslations("common");
  const [state, action, pending] = useActionState<OnboardingState, FormData>(completeOnboardingAction, {});
  const [step, setStep] = useState(state.error === "storeRequired" ? 3 : 1);
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [lang, setLang] = useState(locale);
  const [localError, setLocalError] = useState<"name" | "dob" | null>(null);
  const [minor, setMinor] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  const go = (n: number) => {
    setStep(n);
    requestAnimationFrame(() => heading.current?.focus());
  };

  const nextFromAbout = () => {
    if (name.trim().length < 2) return setLocalError("name");
    const iso = normalizeDate(dob);
    if (!iso || new Date(iso) > new Date()) return setLocalError("dob");
    setLocalError(null);
    if (!isAdult(iso)) return setMinor(true);
    go(2);
  };

  if (minor) {
    return (
      <Card className="mx-auto max-w-xl space-y-3">
        <h1 className="text-3xl">{t("under18Title")}</h1>
        <p className="text-muted">{t("under18Body")}</p>
        {/* Submitting lets the server remove the sign-up; nothing about the minor is stored. */}
        <form action={action}>
          <input type="hidden" name="full_name" value="-" />
          <input type="hidden" name="dob" value={dob} />
          <Button type="submit" variant="secondary">
            {tc("continue")}
          </Button>
        </form>
      </Card>
    );
  }

  const error = localError ?? (state.error === "name" || state.error === "dob" ? state.error : null);

  return (
    <form action={action} className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-semibold text-primary">{t("stepOf", { current: step, total: 3 })}</p>
        <h1 ref={heading} tabIndex={-1} className="text-3xl outline-none">
          {step === 1 ? t("aboutTitle") : step === 2 ? t("languageTitle") : t("consentTitle")}
        </h1>
      </header>

      {/* All values stay in the form so one submit sends them together. */}
      <div hidden={step !== 1}>
        <Card className="space-y-5">
          <p className="text-muted">{t("aboutIntro")}</p>
          <Field id="full_name" label={t("fullName")} hint={t("fullNameHint")} error={error === "name" ? t("errors.name") : undefined}>
            <Input
              id="full_name"
              name="full_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              aria-invalid={error === "name"}
              aria-describedby="full_name-hint"
            />
          </Field>
          <Field id="dob" label={t("dob")} hint={t("dobHint")} error={error === "dob" ? t("errors.dob") : undefined}>
            <Input
              id="dob"
              name="dob"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              inputMode="numeric"
              placeholder="DD/MM/YYYY"
              autoComplete="bday"
              aria-invalid={error === "dob"}
              aria-describedby="dob-hint"
            />
          </Field>
          <Button onClick={nextFromAbout}>{tc("continue")}</Button>
        </Card>
      </div>

      <div hidden={step !== 2}>
        <Card className="space-y-5">
          <p className="text-muted">{t("languageIntro")}</p>
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="sr-only">{t("languageTitle")}</legend>
            {(["en", "hi"] as const).map((l) => (
              <label key={l} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-line bg-paper px-4 has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-primary/30">
                <input type="radio" name="locale" value={l} checked={lang === l} onChange={() => setLang(l)} className="size-5 accent-[var(--primary)]" />
                <span lang={l} className="text-lg font-semibold">
                  {l === "en" ? "English" : "हिन्दी"}
                </span>
              </label>
            ))}
          </fieldset>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => go(1)}>
              {tc("back")}
            </Button>
            <Button onClick={() => go(3)}>{tc("continue")}</Button>
          </div>
        </Card>
      </div>

      <div hidden={step !== 3} className="space-y-4">
        <p className="text-muted">{t("consentIntro")}</p>
        {state.error === "storeRequired" && (
          <Notice tone="warning" role="alert">
            {t("errors.storeRequired")}
          </Notice>
        )}
        {state.error === "generic" && (
          <Notice tone="danger" role="alert">
            {tc("somethingWrong")}
          </Notice>
        )}
        {CONSENTS.map((c) => (
          <Card key={c.purpose} className="p-0">
            <label className="flex cursor-pointer gap-4 p-5">
              <input type="checkbox" name={`consent_${c.purpose}`} className="mt-1 size-5 shrink-0 accent-[var(--primary)]" />
              <span className="space-y-1">
                <span className="block font-semibold">{t(c.title)}</span>
                <span className="block text-muted">{t(c.body)}</span>
              </span>
            </label>
          </Card>
        ))}
        <p className="text-sm text-muted">
          {t("noticeVersion", { version: noticeVersion })} · <Link href="/privacy">{t("readPrivacy")}</Link>
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => go(2)}>
            {tc("back")}
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? tc("saving") : t("finish")}
          </Button>
        </div>
      </div>
    </form>
  );
}
