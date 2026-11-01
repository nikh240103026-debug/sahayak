import { aad, decryptString } from "@app/shared/crypto";
import { mobileHash } from "./session";
import { portalStore } from "./store";

/** The newest unexpired demo "SMS" for a mobile number (shown only to the signed-in applicant). */
export async function latestDemoSms(mobile: string): Promise<{ text: string; sentAt: string } | null> {
  const mh = mobileHash(mobile);
  const row = await portalStore().latestSms(mh);
  if (!row) return null;
  return { text: decryptString(row.message_enc, aad.demoPortal(`sms:${mh}`)), sentAt: row.created_at };
}

/** Test-only helpers are available just for the in-memory store outside production. */
export function devToolsEnabled(): boolean {
  return process.env.DEMO_PORTAL_STORE === "memory" && process.env.NODE_ENV !== "production";
}
