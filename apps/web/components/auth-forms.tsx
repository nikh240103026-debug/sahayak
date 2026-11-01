"use client";

import { useActionState, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import type { AuthState } from "@/app/actions/auth";
import { Button, Field, Input, Notice } from "./ui";

type Action = (prev: AuthState, formData: FormData) => Promise<AuthState>;

function PasswordInput({ id, autoComplete, describedBy }: { id: string; autoComplete: string; describedBy?: string }) {
  const t = useTranslations("auth");
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        name="password"
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        required
        minLength={autoComplete === "new-password" ? 12 : undefined}
        aria-describedby={describedBy}
        className="pr-14"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex min-w-11 items-center justify-center rounded-r-xl text-muted hover:text-ink"
        aria-label={visible ? t("hidePassword") : t("showPassword")}
        aria-pressed={visible}
      >
        {visible ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
      </button>
    </div>
  );
}

export function AuthForm({
  mode,
  action,
  next,
  initialError,
}: {
  mode: "signin" | "signup" | "forgot" | "reset";
  action: Action;
  next?: string;
  initialError?: AuthState["error"];
}) {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(action, { error: initialError });
  const id = useId();

  if (state.done === "checkEmail") {
    return (
      <Notice tone="success" title={t("checkEmailTitle")} role="status">
        {t("checkEmailBody")}
      </Notice>
    );
  }
  if (state.done === "resetSent") {
    return (
      <Notice tone="success" role="status">
        {t("forgotSent")}
      </Notice>
    );
  }

  const button = { signin: t("signInButton"), signup: t("signUpButton"), forgot: t("forgotButton"), reset: t("resetButton") }[mode];
  return (
    <form action={formAction} className="space-y-5" noValidate={false}>
      {state.error && (
        <Notice tone="danger" role="alert">
          {t(`errors.${state.error}`)}
        </Notice>
      )}
      {next && <input type="hidden" name="next" value={next} />}
      {mode !== "reset" && (
        <Field id={`${id}-email`} label={t("email")}>
          <Input id={`${id}-email`} name="email" type="email" autoComplete="email" required inputMode="email" />
        </Field>
      )}
      {mode !== "forgot" && (
        <Field
          id={`${id}-password`}
          label={t("password")}
          hint={mode === "signup" || mode === "reset" ? t("passwordHint") : undefined}
        >
          <PasswordInput
            id={`${id}-password`}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            describedBy={mode === "signup" || mode === "reset" ? `${id}-password-hint` : undefined}
          />
        </Field>
      )}
      <Button type="submit" full disabled={pending}>
        {pending ? "…" : button}
      </Button>
    </form>
  );
}
