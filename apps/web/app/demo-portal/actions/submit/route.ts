import { NextResponse } from "next/server";
import { aad, encryptJSON } from "@app/shared/crypto";
import { formatTrackingId } from "@app/shared/demo-portal";
import { demoIdHash, dobHash, getSession, saveSession } from "@/lib/demo-portal/session";
import { portalStore } from "@/lib/demo-portal/store";

/**
 * Final submission. An Idempotency-Key header (sent by the assistant) makes a
 * repeated submit return the original tracking ID instead of creating a duplicate.
 */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.redirect(new URL("/demo-portal/login?expired=1&next=/demo-portal/apply/7", req.url), 303);
  const fd = await req.formData();
  const { draft } = s.state;
  const go = (path: string) => NextResponse.redirect(new URL(path, req.url), 303);

  if (!draft[1] || !draft[2] || !draft[3] || !draft[4] || !draft[5] || !draft.otpVerified) {
    return go("/demo-portal/apply/1");
  }
  if (fd.get("declaration") !== "on") {
    s.state.flash = { step: 7, errors: ["Declaration: Please tick the declaration to submit."], values: {} };
    await saveSession(s);
    return go("/demo-portal/apply/7");
  }

  const store = portalStore();
  const rawKey = req.headers.get("idempotency-key");
  const key = rawKey && /^[A-Za-z0-9_-]{8,100}$/.test(rawKey) ? rawKey : null;
  if (key) {
    const existing = await store.applicationByKey(key);
    if (existing) {
      s.state.lastTrackingId = existing.tracking_id;
      await saveSession(s);
      return go(`/demo-portal/acknowledgement?tid=${existing.tracking_id}&duplicate=1`);
    }
  }

  const trackingId = formatTrackingId(new Date().getFullYear(), await store.nextTrackingSeq());
  const retentionHours = Number(process.env.RETENTION_HOURS ?? "24") || 24;
  const result = await store.insertApplication({
    tracking_id: trackingId,
    idempotency_key: key,
    demo_id_hash: demoIdHash(s.state.demoId),
    dob_hash: dobHash(s.state.dobIso),
    status: "Submitted - under verification",
    data_enc: encryptJSON({ ...draft[1], ...draft[2], ...draft[3], ...draft[4] }, aad.demoPortal(`app:${trackingId}`)),
    uploads: draft[5].uploads,
    submitted_at: new Date().toISOString(),
    data_expires_at: new Date(Date.now() + retentionHours * 3600_000).toISOString(),
  });
  if (result === "duplicate" && key) {
    const existing = await store.applicationByKey(key);
    if (existing) {
      s.state.lastTrackingId = existing.tracking_id;
      await saveSession(s);
      return go(`/demo-portal/acknowledgement?tid=${existing.tracking_id}&duplicate=1`);
    }
  }
  s.state.lastTrackingId = trackingId;
  s.state.draft = {};
  delete s.state.flash;
  await saveSession(s);
  return go(`/demo-portal/acknowledgement?tid=${trackingId}`);
}
