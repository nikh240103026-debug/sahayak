import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { consentHistory, decryptExtraction, latestDocuments, loadProfile } from "@/lib/data";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** "Export my data": everything we hold about the signed-in user, as JSON. */
export async function GET() {
  const user = await currentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const sb = await supabaseServer();
  const [account, profile, consents, docs, runs, steps, approvals, receipts] = await Promise.all([
    sb.from("accounts").select("locale,theme,onboarded_at,created_at").eq("user_id", user.id).maybeSingle(),
    loadProfile(sb, user.id),
    consentHistory(sb, user.id),
    latestDocuments(sb, user.id),
    sb.from("runs").select("id,service_slug,status,error,created_at,finished_at,llm_usage").order("created_at"),
    sb.from("run_steps").select("run_id,seq,step_id,action,target_label,value_redacted,result,message,created_at").order("run_id").order("seq"),
    sb.from("approvals").select("run_id,kind,payload_redacted,requested_at,resolved_at,decision").order("requested_at"),
    sb.from("receipts").select("run_id,tracking_id,summary_en,summary_hi,created_at"),
  ]);
  const body = {
    exported_at: new Date().toISOString(),
    account: { email: user.email, created_at: user.created_at, ...(account.data ?? {}) },
    profile,
    consents,
    documents: docs.map((d) => ({
      id: d.id,
      kind: d.kind,
      mime: d.mime,
      size_bytes: d.size_bytes,
      uploaded_at: d.created_at,
      deletes_at: d.expires_at,
      extracted: decryptExtraction(user.id, d),
    })),
    applications: runs.data ?? [],
    audit_log: steps.data ?? [],
    checkpoints: approvals.data ?? [],
    receipts: receipts.data ?? [],
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="my-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
