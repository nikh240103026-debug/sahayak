import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";

export interface Account {
  user_id: string;
  locale: "en" | "hi";
  theme: "system" | "light" | "dark";
  onboarded_at: string | null;
}

/** The verified user (checked against Supabase Auth, not just the cookie), or null. */
export async function currentUser(): Promise<User | null> {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  return data.user ?? null;
}

export async function requireUser(next = "/app"): Promise<User> {
  const user = await currentUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent(next)}`);
  return user;
}

export async function getAccount(userId: string): Promise<Account | null> {
  const sb = await supabaseServer();
  const { data } = await sb
    .from("accounts")
    .select("user_id,locale,theme,onboarded_at")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as Account | null) ?? null;
}

/** Signed in and onboarded (consent + age gate done), else redirect. */
export async function requireOnboarded(next = "/app"): Promise<{ user: User; account: Account }> {
  const user = await requireUser(next);
  const account = await getAccount(user.id);
  if (!account?.onboarded_at) redirect("/onboarding");
  return { user, account };
}

/** Only allow same-site relative redirects after sign-in. */
export function safeNext(raw: string | null | undefined, fallback = "/app"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}
