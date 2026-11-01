import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { forgotPasswordAction } from "@/app/actions/auth";
import { AuthForm } from "@/components/auth-forms";
import { AuthShell } from "@/components/auth-shell";

export const metadata = { title: "Reset password" };

export default async function ForgotPassword() {
  const t = await getTranslations("auth");
  return (
    <AuthShell title={t("forgotTitle")} intro={t("forgotIntro")}>
      <AuthForm mode="forgot" action={forgotPasswordAction} />
      <p className="text-sm">
        <Link href="/signin">{t("signInButton")}</Link>
      </p>
    </AuthShell>
  );
}
