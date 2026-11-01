"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CONSENT_PURPOSES, isAdult, normalizeDate } from "@app/shared";
import { LOCALE_COOKIE } from "@/i18n/request";
import { requireUser } from "@/lib/auth";
import { loadProfile, recordConsent, saveProfile } from "@/lib/data";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

export interface OnboardingState {
  error?: "name" | "dob" | "storeRequired" | "generic";
}

export async function completeOnboardingAction(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const user = await requireUser("/onboarding");
  const fullName = String(formData.get("full_name") ?? "").replace(/\s+/g, " ").trim();
  const dob = normalizeDate(String(formData.get("dob") ?? ""));
  const locale = formData.get("locale") === "hi" ? "hi" : "en";
  if (!dob || new Date(dob) > new Date()) return { error: "dob" };

  // Adults only. A minor's details are not stored: the sign-up itself is removed.
  if (!isAdult(dob)) {
    await (await supabaseServer()).auth.signOut();
    await supabaseAdmin().auth.admin.deleteUser(user.id);
    redirect("/onboarding/adults-only");
  }
  if (fullName.length < 2 || fullName.length > 100) return { error: "name" };

  const granted = Object.fromEntries(CONSENT_PURPOSES.map((p) => [p, formData.get(`consent_${p}`) === "on"]));
  if (!granted.store_profile) return { error: "storeRequired" };

  const sb = await supabaseServer();
  try {
    const { error } = await sb
      .from("accounts")
      .upsert({ user_id: user.id, locale, onboarded_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    for (const purpose of CONSENT_PURPOSES) await recordConsent(sb, user.id, purpose, granted[purpose] === true);
    const now = new Date().toISOString();
    const profile = await loadProfile(sb, user.id);
    profile.full_name = { value: fullName, source: "manual", confirmed: true, confirmedAt: now };
    profile.date_of_birth = { value: dob, source: "manual", confirmed: true, confirmedAt: now };
    if (user.email && !profile.email) {
      profile.email = { value: user.email.toLowerCase(), source: "manual", confirmed: false, confirmedAt: null };
    }
    await saveProfile(sb, user.id, profile, false);
  } catch {
    return { error: "generic" };
  }
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 31536000, sameSite: "lax" });
  redirect("/app");
}
