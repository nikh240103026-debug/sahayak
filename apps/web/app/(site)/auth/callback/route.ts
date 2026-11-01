import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { safeNext } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

/** Handles email confirmation, password reset and OAuth redirects from Supabase Auth. */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const next = safeNext(url.searchParams.get("next"), "/app");
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const sb = await supabaseServer();

  let ok = false;
  if (code) {
    ok = !(await sb.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await sb.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }
  const dest = ok ? next : "/signin?error=linkExpired";
  return NextResponse.redirect(new URL(dest, url.origin));
}
