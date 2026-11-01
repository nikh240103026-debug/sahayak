"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE } from "@/i18n/request";
import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

const YEAR = 60 * 60 * 24 * 365;
const prefCookie = { path: "/", maxAge: YEAR, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production" };

/** Language and theme are strictly necessary preference cookies (no tracking). */
export async function setLocaleAction(formData: FormData) {
  const locale = formData.get("locale") === "hi" ? "hi" : "en";
  (await cookies()).set(LOCALE_COOKIE, locale, prefCookie);
  const user = await currentUser();
  if (user) await (await supabaseServer()).from("accounts").update({ locale }).eq("user_id", user.id);
  revalidatePath("/", "layout");
}

export async function setThemeAction(formData: FormData) {
  const raw = formData.get("theme");
  const theme = raw === "light" || raw === "dark" ? raw : "system";
  (await cookies()).set("theme", theme, prefCookie);
  const user = await currentUser();
  if (user) await (await supabaseServer()).from("accounts").update({ theme }).eq("user_id", user.id);
  revalidatePath("/", "layout");
}
