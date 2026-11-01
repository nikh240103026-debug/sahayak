import { createHmac, timingSafeEqual } from "node:crypto";

/** HMAC signing for web app -> worker calls (/wake). Header: t=<unix seconds>,v1=<hex>. */
export const WORKER_SIGNATURE_HEADER = "x-worker-signature";
const TOLERANCE_SECONDS = 300;

function mac(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function signWorkerRequest(secret: string, body: string, nowMs: number = Date.now()): string {
  const t = Math.floor(nowMs / 1000);
  return `t=${t},v1=${mac(secret, t, body)}`;
}

export function verifyWorkerRequest(
  secret: string,
  header: string | null | undefined,
  body: string,
  nowMs: number = Date.now(),
): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  const sig = parts.v1;
  if (!Number.isInteger(t) || typeof sig !== "string" || !/^[0-9a-f]{64}$/.test(sig)) return false;
  if (Math.abs(nowMs / 1000 - t) > TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(mac(secret, t, body), "hex");
  const given = Buffer.from(sig, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}
