import { NextResponse } from "next/server";
import { aad, decryptJSON } from "@app/shared/crypto";
import { devToolsEnabled, latestDemoSms } from "@/lib/demo-portal/sms";
import { memoryData } from "@/lib/demo-portal/store";

/**
 * Local test helper (in-memory demo portal only, never in production):
 * lets the agent e2e test play the applicant's phone and inspect what the portal stored.
 * The agent's browser cannot reach /api/* because of its egress allowlist.
 */
export async function GET(req: Request) {
  if (!devToolsEnabled()) return new NextResponse(null, { status: 404 });
  const sp = new URL(req.url).searchParams;
  if (sp.get("what") === "sms") {
    const sms = await latestDemoSms(sp.get("mobile") ?? "");
    return NextResponse.json({ sms });
  }
  if (sp.get("what") === "reset") {
    const m = memoryData();
    m.sessions.clear();
    m.applications.length = 0;
    m.sms.length = 0;
    return NextResponse.json({ ok: true });
  }
  const apps = memoryData().applications.map((a) => {
    const data = a.data_enc ? decryptJSON<Record<string, string>>(a.data_enc, aad.demoPortal(`app:${a.tracking_id}`)) : {};
    return { tracking_id: a.tracking_id, idempotency_key: a.idempotency_key, remarks: data.remarks ?? "", dob: data.dob, percentage: data.percentage };
  });
  return NextResponse.json({ applications: apps });
}
