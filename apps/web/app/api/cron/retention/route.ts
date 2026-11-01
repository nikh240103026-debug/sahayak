import { NextResponse } from "next/server";
import { safeEqual } from "@app/shared/crypto";
import { env } from "@/lib/env";
import { runRetention } from "@/lib/maintenance";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily cron (Vercel sends `Authorization: Bearer $CRON_SECRET`). Deletes expired documents and screenshots. */
export async function GET(req: Request) {
  const e = env();
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${e.CRON_SECRET}`)) return NextResponse.json({ ok: false }, { status: 401 });
  const report = await runRetention(e.RETENTION_HOURS);
  return NextResponse.json({ ok: true, ...report }, { headers: { "cache-control": "no-store" } });
}
