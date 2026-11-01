import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Liveness + keep-alive. The daily Vercel Cron hits this so the free Supabase
 * project sees activity. It touches the database without reading user data.
 */
export async function GET() {
  const started = Date.now();
  try {
    const { error } = await supabaseAdmin().rpc("health_ping");
    return NextResponse.json(
      { ok: !error, db: error ? "error" : "ok", ms: Date.now() - started },
      { status: error ? 503 : 200, headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ ok: false, db: "unconfigured" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
