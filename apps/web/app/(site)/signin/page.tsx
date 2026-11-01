import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { demoLoginAction, googleSignInAction, signInAction, type AuthState } from "@/app/actions/auth";
import { AuthForm } from "@/components/auth-forms";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui";
import { currentUser, safeNext } from "@/lib/auth";
import { publicEnv } from "@/lib/public-env";

export const metadata = { title: "Sign in" };

const KNOWN_ERRORS = new Set(["invalid", "notConfirmed", "rateLimited", "linkExpired", "generic"]);

export default async function SignIn({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next, "/app");
  if (await currentUser().catch(() => null)) redirect(next);
  const t = await getTranslations("auth");
  const initialError = sp.error && KNOWN_ERRORS.has(sp.error) ? (sp.error as AuthState["error"]) : undefined;

  return (
    <AuthShell title={t("signInTitle")} intro={t("signInIntro")}>
      <AuthForm mode="signin" action={signInAction} next={next} initialError={initialError} />
      <p className="text-sm">
        <Link href="/forgot-password">{t("forgot")}</Link>
      </p>
      {publicEnv.googleAuth && (
        <form action={googleSignInAction} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <p className="text-center text-sm text-muted">{t("or")}</p>
          <Button type="submit" variant="secondary" full>
            {t("google")}
          </Button>
        </form>
      )}
      {publicEnv.demoLogin && (
        <form action={demoLoginAction} className="space-y-2 rounded-xl border border-dashed border-accent p-4">
          <Button type="submit" variant="stamp" full>
            {t("demoLogin")}
          </Button>
          <p className="text-sm text-muted">{t("demoLoginNote")}</p>
        </form>
      )}
      <p className="text-sm">
        {t("noAccount")} <Link href="/signup">{t("signUpButton")}</Link>
      </p>
    </AuthShell>
  );
}
