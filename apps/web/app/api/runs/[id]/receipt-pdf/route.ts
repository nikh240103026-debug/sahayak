import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { getOwnRun } from "@/lib/runs";
import { supabaseServer } from "@/lib/supabase/server";

/** Redirect to a 60-second signed URL for the user's own receipt PDF. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const run = await getOwnRun(user.id, (await params).id);
  if (!run) return new NextResponse(null, { status: 404 });
  const sb = await supabaseServer();
  const { data } = await sb.from("receipts").select("receipt_pdf_key,tracking_id").eq("run_id", run.id).maybeSingle();
  const row = data as { receipt_pdf_key: string | null; tracking_id: string } | null;
  if (!row?.receipt_pdf_key) return new NextResponse(null, { status: 404 });
  const { data: signed } = await sb.storage
    .from("run-artifacts")
    .createSignedUrl(row.receipt_pdf_key, 60, { download: `receipt-${row.tracking_id}.pdf` });
  if (!signed?.signedUrl) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(signed.signedUrl, 302);
}
