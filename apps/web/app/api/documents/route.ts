import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { containsAadhaar, extensionFor, sniffMime } from "@app/shared";
import { sha256Hex } from "@app/shared/crypto";
import { pdfText } from "@app/shared/pdf";
import { BUNDLED_SERVICES } from "@app/shared/services";
import { loadConsents } from "@/lib/data";
import { env } from "@/lib/env";
import { hitRateLimit, isSameOrigin } from "@/lib/request";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

type UploadError = "tooBig" | "type" | "aadhaar" | "rate" | "consent" | "generic";
const fail = (error: UploadError, status = 400) => NextResponse.json({ ok: false, error }, { status });

/**
 * Upload one document. Checks size, real file type (magic bytes) and, for PDFs
 * with a text layer, refuses files that show an Aadhaar number. The file is
 * stored unchanged in the user's private folder.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return fail("generic", 403);
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  const user = auth.user;
  if (!user) return fail("generic", 401);
  if (!(await loadConsents(sb, user.id)).store_profile.granted) return fail("consent", 403);
  if (!(await hitRateLimit(`upload:${user.id}`, 30, 3600))) return fail("rate", 429);

  const form = await req.formData().catch(() => null);
  const kind = String(form?.get("kind") ?? "");
  const file = form?.get("file");
  const spec = BUNDLED_SERVICES.flatMap((s) => s.requiredDocs).find((d) => d.kind === kind);
  if (!spec || !(file instanceof File)) return fail("generic");
  if (file.size === 0 || file.size > spec.maxBytes) return fail("tooBig", 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffMime(bytes);
  if (!mime || !spec.mimeTypes.includes(mime)) return fail("type", 415);
  if (mime === "application/pdf") {
    const text = await pdfText(bytes).catch(() => "");
    if (containsAadhaar(text)) return fail("aadhaar", 422);
  }

  const id = randomUUID();
  const storageKey = `${user.id}/${id}.${extensionFor(mime)}`;
  const up = await sb.storage.from("user-documents").upload(storageKey, bytes, { contentType: mime, upsert: false });
  if (up.error) return fail("generic", 500);

  // Keep only the newest file of each kind (data minimisation).
  const { data: older } = await sb.from("documents").select("id,storage_key").eq("user_id", user.id).eq("kind", kind);
  const expiresAt = new Date(Date.now() + env().RETENTION_HOURS * 3600_000).toISOString();
  const { error } = await sb.from("documents").insert({
    id,
    user_id: user.id,
    kind,
    storage_key: storageKey,
    sha256: sha256Hex(bytes),
    mime,
    size_bytes: file.size,
    expires_at: expiresAt,
  });
  if (error) {
    await sb.storage.from("user-documents").remove([storageKey]);
    return fail("generic", 500);
  }
  const stale = (older ?? []) as Array<{ id: string; storage_key: string }>;
  if (stale.length) {
    await sb.storage.from("user-documents").remove(stale.map((d) => d.storage_key));
    await sb.from("documents").delete().in("id", stale.map((d) => d.id));
  }
  return NextResponse.json({ ok: true, id, expiresAt });
}

export async function DELETE(req: Request) {
  if (!isSameOrigin(req)) return fail("generic", 403);
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return fail("generic", 401);
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const { data } = await sb.from("documents").select("storage_key").eq("id", id).eq("user_id", auth.user.id).maybeSingle();
  if (!data) return fail("generic", 404);
  await sb.storage.from("user-documents").remove([(data as { storage_key: string }).storage_key]);
  await sb.from("documents").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
