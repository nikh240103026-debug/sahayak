import { getTranslations } from "next-intl/server";
import { resetPasswordAction } from "@/app/actions/auth";
import { AuthForm } from "@/components/auth-forms";
import { AuthShell } from "@/components/auth-shell";
import { currentUser } from "@/lib/auth";

export const metadata = { title: "Choose a new password" };

export default async function ResetPassword() {
  const t = await getTranslations("auth");
  const user = await currentUser().catch(() => null);
  return (
    <AuthShell title={t("resetTitle")} intro={t("passwordHint")}>
      <AuthForm mode="reset" action={resetPasswordAction} initialError={user ? undefined : "linkExpired"} />
    </AuthShell>
  );
}
