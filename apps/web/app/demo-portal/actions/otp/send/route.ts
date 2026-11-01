import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { aad, encryptString } from "@app/shared/crypto";
import { getSession, hmacHex, mobileHash, saveSession } from "@/lib/demo-portal/session";
import { portalStore } from "@/lib/demo-portal/store";
import { brand } from "@app/shared/brand";

const OTP_MINUTES = 10;

/**
 * "Sends" an OTP. The code goes only to the demo SMS outbox, which the signed-in
 * applicant sees in the assistant's checkpoint screen. The portal page never shows it.
 */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.redirect(new URL("/demo-portal/login?expired=1&next=/demo-portal/apply/6", req.url), 303);
  const mobile = s.state.draft[1]?.mobile;
  if (!mobile) return NextResponse.redirect(new URL("/demo-portal/apply/1", req.url), 303);
  const fd = await req.formData();
  const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const exp = Date.now() + OTP_MINUTES * 60_000;
  s.state.otp = { hash: hmacHex("otp", `${s.id}.${otp}`), exp, attempts: 0, last2: mobile.slice(-2) };
  delete s.state.flash;
  await saveSession(s);
  const mh = mobileHash(mobile);
  await portalStore().insertSms(
    mh,
    encryptString(
      `${otp} is your OTP for the ${brand.demoPortal.en}. It is valid for ${OTP_MINUTES} minutes. Do not share it with anyone.`,
      aad.demoPortal(`sms:${mh}`),
    ),
    new Date(exp),
  );
  return NextResponse.redirect(new URL(`/demo-portal/apply/6${fd.get("resend") ? "?resent=1" : ""}`, req.url), 303);
}
