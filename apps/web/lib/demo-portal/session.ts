import { cookies } from "next/headers";
import { createHash, randomInt } from "node:crypto";
import { aad, decryptJSON, encryptJSON, portalHmac, randomToken, safeEqual } from "@app/shared/crypto";
import type { ChaosFlag } from "@app/shared/demo-portal";
import { portalStore } from "./store";

/**
 * Session handling for the fictional demo portal. It deliberately behaves like
 * a dated government site (short sessions, CAPTCHA, OTP) but stores its data
 * encrypted and only briefly.
 */

export const SESSION_COOKIE = "rcdp_sid";
export const TRUSTED_COOKIE = "rcdp_trusted";
const SESSION_MINUTES = 20;
const TRUSTED_MINUTES = 30;
export const SESSION_MAX_AGE = SESSION_MINUTES * 60;
export const TRUSTED_MAX_AGE = TRUSTED_MINUTES * 60;

export interface Upload {
  kind: string;
  mime: string;
  size: number;
  sha256: string;
}

export interface PortalDraft {
  1?: Record<string, string>;
  2?: Record<string, string>;
  3?: Record<string, string>;
  4?: Record<string, string>;
  5?: { uploads: Upload[] };
  otpVerified?: boolean;
}

export interface PortalState {
  demoId: string;
  dobIso: string;
  loginAt: number;
  chaos: ChaosFlag[];
  tripped: { expiry?: boolean; dob?: boolean; pct?: boolean };
  draft: PortalDraft;
  otp?: { hash: string; exp: number; attempts: number; last2: string };
  lastTrackingId?: string;
  flash?: { step: number; errors: string[]; values: Record<string, string> };
}

export interface PortalSession {
  id: string;
  state: PortalState;
}

export function hmacHex(purpose: string, value: string): string {
  return portalHmac(purpose, value);
}

export const demoIdHash = (demoId: string) => hmacHex("demo-id", demoId.trim().toUpperCase());
export const dobHash = (dobIso: string) => hmacHex("dob", dobIso);
export const mobileHash = (mobile: string) => hmacHex("mobile", mobile.replace(/\D/g, "").slice(-10));

const sessionIdFor = (token: string) => createHash("sha256").update(token).digest("hex");

export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/demo-portal",
    maxAge: maxAgeSeconds,
  };
}

export async function getSession(): Promise<PortalSession | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const row = await portalStore().getSession(sessionIdFor(token));
  if (!row || new Date(row.expires_at) < new Date()) return null;
  return { id: row.id, state: decryptJSON<PortalState>(row.state_enc, aad.demoPortal(row.id)) };
}

/** Start a session; a saved draft for the same applicant (from an expired session) is carried over. */
export async function createSession(demoId: string, dobIso: string, chaos: ChaosFlag[]): Promise<string> {
  const store = portalStore();
  const idHash = demoIdHash(demoId);
  const previous = await store.latestSessionFor(idHash, new Date(Date.now() - 3600_000));
  let carried: Partial<PortalState> = {};
  if (previous) {
    const prev = decryptJSON<PortalState>(previous.state_enc, aad.demoPortal(previous.id));
    if (prev.dobIso === dobIso && !prev.lastTrackingId) {
      carried = { draft: prev.draft, tripped: prev.tripped, chaos: prev.chaos.length ? prev.chaos : chaos };
    }
  }
  await store.deleteSessionsFor(idHash);
  const token = randomToken(32);
  const id = sessionIdFor(token);
  const state: PortalState = {
    demoId: demoId.trim().toUpperCase(),
    dobIso,
    loginAt: Date.now(),
    chaos,
    tripped: {},
    draft: {},
    ...carried,
  };
  await store.insertSession({
    id,
    demo_id_hash: idHash,
    state_enc: encryptJSON(state, aad.demoPortal(id)),
    chaos: state.chaos,
    expires_at: new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString(),
  });
  return token;
}

export async function saveSession(s: PortalSession): Promise<void> {
  await portalStore().updateSession(s.id, {
    state_enc: encryptJSON(s.state, aad.demoPortal(s.id)),
    expires_at: new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString(),
  });
}

/** Expire the session but keep its draft, so logging in again resumes the application. */
export async function expireSession(s: PortalSession): Promise<void> {
  await portalStore().updateSession(s.id, {
    state_enc: encryptJSON(s.state, aad.demoPortal(s.id)),
    expires_at: new Date(Date.now() - 1000).toISOString(),
  });
}

/* -------------------- CAPTCHA (a simple question, for humans) -------------------- */

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

export function makeCaptcha(): { question: string; token: string } {
  const a = randomInt(2, 10);
  const b = randomInt(1, 10);
  const exp = Date.now() + 10 * 60_000;
  const answerMac = hmacHex("captcha-answer", `${a + b}.${exp}`);
  const payload = `${exp}.${answerMac}`;
  return {
    question: `What is ${WORDS[a]} plus ${WORDS[b]}? Type the answer in digits.`,
    token: `${payload}.${hmacHex("captcha-token", payload)}`,
  };
}

export function verifyCaptcha(token: string, answer: string): boolean {
  const [exp, answerMac, mac] = token.split(".");
  if (!exp || !answerMac || !mac) return false;
  if (!safeEqual(mac, hmacHex("captcha-token", `${exp}.${answerMac}`))) return false;
  if (Number(exp) < Date.now()) return false;
  return safeEqual(answerMac, hmacHex("captcha-answer", `${answer.trim()}.${exp}`));
}

/* -------------------- "Trusted device" for 30 minutes after one CAPTCHA -------------------- */

export function makeTrusted(demoId: string): string {
  const body = `${demoIdHash(demoId).slice(0, 32)}.${Date.now() + TRUSTED_MAX_AGE * 1000}`;
  return `${body}.${hmacHex("trusted", body)}`;
}

export function isTrusted(token: string | undefined, demoId: string): boolean {
  if (!token) return false;
  const [idPart, exp, mac] = token.split(".");
  if (!idPart || !exp || !mac) return false;
  if (!safeEqual(mac, hmacHex("trusted", `${idPart}.${exp}`)) || Number(exp) < Date.now()) return false;
  return idPart === demoIdHash(demoId).slice(0, 32);
}

export async function hasTrustedCookie(): Promise<boolean> {
  return Boolean((await cookies()).get(TRUSTED_COOKIE)?.value);
}
