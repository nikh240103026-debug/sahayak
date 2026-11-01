import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { normalizeDate } from "@app/shared";
import { DEMO_ID_PATTERN, parseChaos } from "@app/shared/demo-portal";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  TRUSTED_COOKIE,
  TRUSTED_MAX_AGE,
  cookieOptions,
  createSession,
  isTrusted,
  makeTrusted,
  verifyCaptcha,
} from "@/lib/demo-portal/session";

function portalPath(raw: FormDataEntryValue | null): string {
  const s = typeof raw === "string" ? raw : "";
  return /^\/demo-portal\/[a-z0-9/_-]*$/i.test(s) ? s : "/demo-portal/home";
}

export async function POST(req: Request) {
  const fd = await req.formData();
  const demoId = String(fd.get("demo_id") ?? "").trim().toUpperCase();
  const dob = String(fd.get("login_dob") ?? "").trim();
  const next = portalPath(fd.get("next"));
  const chaosRaw = String(fd.get("chaos") ?? "");
  const jar = await cookies();
  const trusted = isTrusted(jar.get(TRUSTED_COOKIE)?.value, demoId);

  const fail = (error: string) => {
    const u = new URL("/demo-portal/login", req.url);
    u.searchParams.set("error", error);
    u.searchParams.set("next", next);
    if (chaosRaw) u.searchParams.set("chaos", chaosRaw);
    if (!trusted) u.searchParams.set("captcha", "1");
    return NextResponse.redirect(u, 303);
  };

  if (!DEMO_ID_PATTERN.test(demoId)) return fail("id");
  const iso = /^\d{2}\/\d{2}\/\d{4}$/.test(dob) ? normalizeDate(dob) : null;
  if (!iso) return fail("dob");
  if (!trusted) {
    const ok = verifyCaptcha(String(fd.get("captcha_token") ?? ""), String(fd.get("captcha_answer") ?? ""));
    if (!ok) return fail("captcha");
  }

  const token = await createSession(demoId, iso, parseChaos(chaosRaw));
  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.cookies.set(SESSION_COOKIE, token, cookieOptions(SESSION_MAX_AGE));
  if (!trusted) res.cookies.set(TRUSTED_COOKIE, makeTrusted(demoId), cookieOptions(TRUSTED_MAX_AGE));
  return res;
}
