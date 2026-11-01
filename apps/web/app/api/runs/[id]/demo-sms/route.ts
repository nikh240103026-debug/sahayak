import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { loadProfile } from "@/lib/data";
import { latestDemoSms } from "@/lib/demo-portal/sms";
import { getOwnRun } from "@/lib/runs";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * The practice portal's "SMS" for the signed-in applicant, shown in the OTP
 * checkpoint. Only available while that run has an open OTP checkpoint. The
 * agent's browser can never reach this route (egress allowlist: /demo-portal only).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const run = await getOwnRun(user.id, (await params).id);
  if (!run || run.status !== "AWAITING_HUMAN") return NextResponse.json({ sms: null });
  const { data } = await supabaseAdmin()
    .from("approvals")
    .select("id")
    .eq("run_id", run.id)
    .eq("kind", "otp")
    .is("resolved_at", null)
    .limit(1);
  if (!data?.length) return NextResponse.json({ sms: null });
  const mobile = (await loadProfile(await supabaseServer(), user.id)).mobile;
  if (!mobile?.confirmed) return NextResponse.json({ sms: null });
  const sms = await latestDemoSms(mobile.value);
  return NextResponse.json({ sms }, { headers: { "cache-control": "no-store" } });
}
