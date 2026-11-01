"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNext } from "@/lib/auth";
import { env } from "@/lib/env";
import { publicEnv } from "@/lib/public-env";
import { clientIpKey, hitRateLimit, limiterKey } from "@/lib/request";
import { supabaseServer } from "@/lib/supabase/server";

export interface AuthState {
  error?: "invalid" | "notConfirmed" | "weakPassword" | "exists" | "rateLimited" | "linkExpired" | "generic";
  done?: "checkEmail" | "resetSent" | "passwordUpdated";
}

const Email = z.email().max(254);
const Password = z.string().min(12).max(200);

async function limited(scope: string, email?: string): Promise<boolean> {
  const ip = await clientIpKey();
  const okIp = await hitRateLimit(`auth:${scope}:ip:${ip}`, 20, 3600);
  const okEmail = email ? await hitRateLimit(`auth:${scope}:email:${limiterKey("email", email.toLowerCase())}`, 8, 3600) : true;
  return !(okIp && okEmail);
}

export async function signInAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = Email.safeParse(String(formData.get("email") ?? "").trim());
  const password = String(formData.get("password") ?? "");
  if (!email.success || !password) return { error: "invalid" };
  if (await limited("signin", email.data)) return { error: "rateLimited" };
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email: email.data, password });
  if (error) {
    if (/confirm/i.test(error.message)) return { error: "notConfirmed" };
    if (error.status === 429) return { error: "rateLimited" };
    return { error: "invalid" };
  }
  redirect(safeNext(String(formData.get("next") ?? ""), "/app"));
}

export async function signUpAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = Email.safeParse(String(formData.get("email") ?? "").trim());
  const password = Password.safeParse(String(formData.get("password") ?? ""));
  if (!email.success) return { error: "invalid" };
  if (!password.success) return { error: "weakPassword" };
  if (await limited("signup", email.data)) return { error: "rateLimited" };
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.signUp({
    email: email.data,
    password: password.data,
    options: { emailRedirectTo: `${publicEnv.siteUrl}/auth/callback?next=/onboarding` },
  });
  if (error) {
    if (error.status === 429) return { error: "rateLimited" };
    if (/password/i.test(error.message)) return { error: "weakPassword" };
    if (/registered|exists/i.test(error.message)) return { error: "exists" };
    return { error: "generic" };
  }
  if (data.session) redirect("/onboarding");
  return { done: "checkEmail" };
}

export async function forgotPasswordAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = Email.safeParse(String(formData.get("email") ?? "").trim());
  if (!email.success) return { error: "invalid" };
  if (await limited("reset", email.data)) return { error: "rateLimited" };
  const sb = await supabaseServer();
  await sb.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${publicEnv.siteUrl}/auth/callback?next=/reset-password`,
  });
  // Same answer whether or not the account exists.
  return { done: "resetSent" };
}

export async function resetPasswordAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const password = Password.safeParse(String(formData.get("password") ?? ""));
  if (!password.success) return { error: "weakPassword" };
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) return { error: "linkExpired" };
  const { error } = await sb.auth.updateUser({ password: password.data });
  if (error) return { error: /password/i.test(error.message) ? "weakPassword" : "generic" };
  redirect("/app");
}

export async function googleSignInAction(formData: FormData): Promise<void> {
  if (!publicEnv.googleAuth) redirect("/signin");
  const sb = await supabaseServer();
  const next = safeNext(String(formData.get("next") ?? ""), "/app");
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${publicEnv.siteUrl}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect("/signin?error=generic");
  redirect(data.url);
}

/** Clearly labelled shortcut for demo days; off unless NEXT_PUBLIC_ENABLE_DEMO_LOGIN=true. */
export async function demoLoginAction(): Promise<void> {
  const e = env();
  if (!e.NEXT_PUBLIC_ENABLE_DEMO_LOGIN || !e.DEMO_LOGIN_EMAIL || !e.DEMO_LOGIN_PASSWORD) redirect("/signin");
  if (await limited("demo")) redirect("/signin?error=rateLimited");
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email: e.DEMO_LOGIN_EMAIL, password: e.DEMO_LOGIN_PASSWORD });
  redirect(error ? "/signin?error=generic" : "/app");
}
