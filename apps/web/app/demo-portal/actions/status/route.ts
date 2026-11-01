import { NextResponse } from "next/server";
import { normalizeDate } from "@app/shared";
import { dobHash, hmacHex } from "@/lib/demo-portal/session";
import { portalStore } from "@/lib/demo-portal/store";

export async function POST(req: Request) {
  const fd = await req.formData();
  const tid = String(fd.get("tracking") ?? "").trim().toUpperCase();
  const dob = String(fd.get("dob") ?? "").trim();
  const iso = /^\d{2}\/\d{2}\/\d{4}$/.test(dob) ? normalizeDate(dob) : null;
  const app = /^DEMO-SCH-\d{4}-\d{5}$/.test(tid) && iso ? await portalStore().applicationByTracking(tid) : null;
  const u = new URL("/demo-portal/status", req.url);
  if (!app || !iso || app.dob_hash !== dobHash(iso)) {
    u.searchParams.set("r", "notfound");
  } else {
    const exp = String(Date.now() + 5 * 60_000);
    u.searchParams.set("tid", tid);
    u.searchParams.set("st", app.status);
    u.searchParams.set("exp", exp);
    u.searchParams.set("sig", hmacHex("status", `${tid}|${app.status}|${exp}`));
  }
  return NextResponse.redirect(u, 303);
}
