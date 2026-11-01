import type { SupabaseClient } from "@supabase/supabase-js";
import { aad, decryptJSON } from "@app/shared/crypto";
import { Profile } from "@app/shared";
import { mobileHash } from "@/lib/demo-portal/session";
import { supabaseAdmin } from "@/lib/supabase/server";

const BUCKETS = ["user-documents", "run-artifacts"] as const;

/** Every object path under a prefix, walking folders (Storage lists one level at a time). */
export async function listAll(db: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  const queue = [prefix];
  while (queue.length) {
    const dir = queue.shift()!;
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db.storage.from(bucket).list(dir, { limit: 1000, offset });
      if (error || !data?.length) break;
      for (const item of data) {
        const path = `${dir}/${item.name}`;
        if (item.id === null) queue.push(path); // folder
        else out.push(path);
      }
      if (data.length < 1000) break;
    }
  }
  return out;
}

async function removeAll(db: SupabaseClient, bucket: string, paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await db.storage.from(bucket).remove(paths.slice(i, i + 100));
    if (error) throw new Error(`storage delete failed: ${error.message}`);
  }
}

/**
 * Hard-delete an account: storage objects first, then the practice portal's
 * copies, then the auth user (every table cascades from auth.users).
 */
export async function purgeUserData(userId: string): Promise<void> {
  const db = supabaseAdmin();
  for (const bucket of BUCKETS) await removeAll(db, bucket, await listAll(db, bucket, userId));

  const { data: runs } = await db.from("runs").select("idempotency_key").eq("user_id", userId);
  const keys = ((runs ?? []) as Array<{ idempotency_key: string }>).map((r) => r.idempotency_key);
  if (keys.length) await db.from("demo_applications").delete().in("idempotency_key", keys);

  const { data: prof } = await db.from("profiles_private").select("data_enc").eq("user_id", userId).maybeSingle();
  if (prof) {
    const mobile = Profile.safeParse(decryptJSON((prof as { data_enc: string }).data_enc, aad.profile(userId)));
    if (mobile.success && mobile.data.mobile?.value) {
      await db.from("demo_sms_outbox").delete().eq("mobile_hash", mobileHash(mobile.data.mobile.value));
    }
  }

  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) throw new Error(`could not delete user: ${error.message}`);
}

export interface RetentionReport {
  documents: number;
  screenshots: number;
  demoApplications: number;
  demoSessions: number;
  demoSms: number;
}

/** Delete expired documents and screenshots (RETENTION_HOURS) plus expired practice-portal data. */
export async function runRetention(retentionHours: number): Promise<RetentionReport> {
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - retentionHours * 3600_000).toISOString();
  const report: RetentionReport = { documents: 0, screenshots: 0, demoApplications: 0, demoSessions: 0, demoSms: 0 };

  for (;;) {
    const { data } = await db.from("documents").select("id,storage_key").lt("expires_at", now).limit(500);
    const docs = (data ?? []) as Array<{ id: string; storage_key: string }>;
    if (!docs.length) break;
    await removeAll(db, "user-documents", docs.map((d) => d.storage_key));
    await db.from("documents").delete().in("id", docs.map((d) => d.id));
    report.documents += docs.length;
    if (docs.length < 500) break;
  }

  for (;;) {
    const { data } = await db
      .from("run_steps")
      .select("id,screenshot_key")
      .not("screenshot_key", "is", null)
      .lt("created_at", cutoff)
      .limit(500);
    const steps = (data ?? []) as Array<{ id: number; screenshot_key: string }>;
    if (!steps.length) break;
    await removeAll(db, "run-artifacts", steps.map((s) => s.screenshot_key));
    await db.from("run_steps").update({ screenshot_key: null }).in("id", steps.map((s) => s.id));
    report.screenshots += steps.length;
    if (steps.length < 500) break;
  }

  const apps = await db
    .from("demo_applications")
    .update({ data_enc: null, uploads: [] })
    .lt("data_expires_at", now)
    .not("data_enc", "is", null)
    .select("id");
  report.demoApplications = apps.data?.length ?? 0;
  const sessions = await db.from("demo_portal_sessions").delete().lt("expires_at", cutoff).select("id");
  report.demoSessions = sessions.data?.length ?? 0;
  const sms = await db.from("demo_sms_outbox").delete().lt("expires_at", now).select("id");
  report.demoSms = sms.data?.length ?? 0;
  return report;
}
