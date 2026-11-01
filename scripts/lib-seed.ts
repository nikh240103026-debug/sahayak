import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { CONSENT_NOTICE_VERSION, CONSENT_PURPOSES } from "@app/shared";
import { aad, encryptJSON, sha256Hex } from "@app/shared/crypto";
import { confirmedProfile, sampleDocuments } from "../e2e/support/sample-applicant";

export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example)");
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Create (or reuse) a confirmed user with the fictional sample applicant's
 * onboarding, consents, confirmed profile and synthetic documents.
 */
export async function prepareSampleApplicant(db: SupabaseClient, email: string, password: string): Promise<string> {
  let userId: string | undefined;
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.data.user) userId = created.data.user.id;
  else {
    for (let page = 1; page < 50 && !userId; page++) {
      const list = await db.auth.admin.listUsers({ page, perPage: 200 });
      userId = list.data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
      if (!list.data.users.length) break;
    }
    if (!userId) throw new Error(`could not create or find ${email}: ${created.error?.message}`);
    await db.auth.admin.updateUserById(userId, { password });
  }

  await db.from("accounts").upsert({ user_id: userId, locale: "en", onboarded_at: new Date().toISOString() }, { onConflict: "user_id" });
  for (const purpose of CONSENT_PURPOSES) {
    await db.from("consents").insert({ user_id: userId, purpose, granted: true, notice_version: CONSENT_NOTICE_VERSION });
  }
  const profile = confirmedProfile();
  await db
    .from("profiles_private")
    .upsert({ user_id: userId, data_enc: encryptJSON(profile, aad.profile(userId)), confirmed_at: new Date().toISOString() }, { onConflict: "user_id" });

  const hours = Number(process.env.RETENTION_HOURS ?? 24) || 24;
  for (const [kind, bytes] of Object.entries(await sampleDocuments())) {
    const id = randomUUID();
    const key = `${userId}/${id}.pdf`;
    const up = await db.storage.from("user-documents").upload(key, bytes, { contentType: "application/pdf" });
    if (up.error) throw new Error(`upload ${kind}: ${up.error.message}`);
    await db.from("documents").delete().eq("user_id", userId).eq("kind", kind);
    const ins = await db.from("documents").insert({
      id,
      user_id: userId,
      kind,
      storage_key: key,
      sha256: sha256Hex(bytes),
      mime: "application/pdf",
      size_bytes: bytes.length,
      extraction_status: "skipped",
      confirmed: true,
      expires_at: new Date(Date.now() + hours * 3600_000).toISOString(),
    });
    if (ins.error) throw new Error(`document ${kind}: ${ins.error.message}`);
  }
  return userId;
}
