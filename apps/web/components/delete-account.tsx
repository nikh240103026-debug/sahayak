"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { deleteAccountAction, type DeleteState } from "@/app/actions/settings";
import { Button, Field, Input, Notice } from "./ui";

export function DeleteAccount() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [state, action, pending] = useActionState<DeleteState, FormData>(deleteAccountAction, {});
  return (
    <form action={action} className="space-y-4">
      {state.error === "generic" && (
        <Notice tone="danger" role="alert">
          {tc("somethingWrong")}
        </Notice>
      )}
      <Field id="confirm-delete" label={t("deleteConfirmLabel")} error={state.error === "confirm" ? t("deleteConfirmLabel") : undefined}>
        <Input id="confirm-delete" name="confirm" autoComplete="off" className="max-w-xs" aria-invalid={state.error === "confirm"} />
      </Field>
      <Button type="submit" variant="danger" disabled={pending}>
        {t("deleteButton")}
      </Button>
    </form>
  );
}
