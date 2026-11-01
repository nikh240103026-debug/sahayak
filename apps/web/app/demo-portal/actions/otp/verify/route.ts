import { NextResponse } from "next/server";
import { safeEqual } from "@app/shared/crypto";
import { getSession, hmacHex, saveSession } from "@/lib/demo-portal/session";

const MAX_ATTEMPTS = 5;

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.redirect(new URL("/demo-portal/login?expired=1&next=/demo-portal/apply/6", req.url), 303);
  const otp = String((await req.formData()).get("otp") ?? "").trim();
  const state = s.state;
  const fail = async (msg: string) => {
    state.flash = { step: 6, errors: [`OTP: ${msg}`], values: {} };
    await saveSession(s);
    return NextResponse.redirect(new URL("/demo-portal/apply/6", req.url), 303);
  };
  if (!state.otp || state.otp.exp < Date.now()) {
    delete state.otp;
    return fail("The OTP has expired. Please request a new one.");
  }
  if (++state.otp.attempts > MAX_ATTEMPTS) {
    delete state.otp;
    return fail("Too many wrong attempts. Please request a new OTP.");
  }
  if (!/^\d{6}$/.test(otp) || !safeEqual(state.otp.hash, hmacHex("otp", `${s.id}.${otp}`))) {
    return fail("The OTP is not correct. Please check and try again.");
  }
  state.draft.otpVerified = true;
  delete state.otp;
  delete state.flash;
  await saveSession(s);
  return NextResponse.redirect(new URL("/demo-portal/apply/7", req.url), 303);
}
