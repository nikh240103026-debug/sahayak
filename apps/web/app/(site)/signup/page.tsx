import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { googleSignInAction, signUpAction } from "@/app/actions/auth";
import { AuthForm } from "@/components/auth-forms";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { publicEnv } from "@/lib/public-env";

export const metadata = { title: "Create account" };

export default async function SignUp() {
  if (await currentUser().catch(() => null)) redirect("/app");
  const t = await getTranslations("auth");
  return (
    <AuthShell title={t("signUpTitle")} intro={t("signUpIntro")}>
      <AuthForm mode="signup" action={signUpAction} />
      {publicEnv.googleAuth && (
        <form action={googleSignInAction} className="space-y-3">
          <input type="hidden" name="next" value="/onboarding" />
          <p className="text-center text-sm text-muted">{t("or")}</p>
          <Button type="submit" variant="secondary" full>
            {t("google")}
          </Button>
        </form>
      )}
      <p className="text-sm">
        {t("haveAccount")} <Link href="/signin">{t("signInButton")}</Link>
      </p>
    </AuthShell>
  );
}
