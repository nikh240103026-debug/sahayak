import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { CONSENT_NOTICE_VERSION } from "@app/shared";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { getAccount, requireUser } from "@/lib/auth";

export const metadata = { title: "Getting started" };

export default async function Onboarding() {
  const user = await requireUser("/onboarding");
  const account = await getAccount(user.id);
  if (account?.onboarded_at) redirect("/app");
  const locale = (await getLocale()) as "en" | "hi";
  return <OnboardingWizard locale={locale} noticeVersion={CONSENT_NOTICE_VERSION} />;
}
