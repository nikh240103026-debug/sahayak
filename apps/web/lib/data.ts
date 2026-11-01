import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CONSENT_NOTICE_VERSION,
  CONSENT_PURPOSES,
  Profile,
  ServiceDefinition,
  StoredExtraction,
  type ConsentPurpose,
} from "@app/shared";
import { aad, decryptJSON, encryptJSON } from "@app/shared/crypto";
import { getBundledService } from "@app/shared/services";

/* -------------------------------- profile -------------------------------- */

export async function loadProfile(sb: SupabaseClient, userId: string): Promise<Profile> {
  const { data } = await sb.from("profiles_private").select("data_enc").eq("user_id", userId).maybeSingle();
  if (!data) return {};
  return Profile.parse(decryptJSON((data as { data_enc: string }).data_enc, aad.profile(userId)));
}

export async function saveProfile(sb: SupabaseClient, userId: string, profile: Profile, confirmed: boolean) {
  const { error } = await sb.from("profiles_private").upsert(
    {
      user_id: userId,
      data_enc: encryptJSON(Profile.parse(profile), aad.profile(userId)),
      schema_version: 1,
      ...(confirmed ? { confirmed_at: new Date().toISOString() } : {}),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`could not save profile: ${error.message}`);
}

/* -------------------------------- consents ------------------------------- */

export type ConsentState = Record<ConsentPurpose, { granted: boolean; at: string | null }>;

export async function loadConsents(sb: SupabaseClient, userId: string): Promise<ConsentState> {
  const { data } = await sb
    .from("consents")
    .select("purpose,granted,created_at,id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  const state = Object.fromEntries(CONSENT_PURPOSES.map((p) => [p, { granted: false, at: null }])) as ConsentState;
  const seen = new Set<string>();
  for (const row of (data ?? []) as Array<{ purpose: ConsentPurpose; granted: boolean; created_at: string }>) {
    if (seen.has(row.purpose)) continue;
    seen.add(row.purpose);
    state[row.purpose] = { granted: row.granted, at: row.created_at };
  }
  return state;
}

export async function consentHistory(sb: SupabaseClient, userId: string) {
  const { data } = await sb
    .from("consents")
    .select("purpose,granted,notice_version,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []) as Array<{ purpose: ConsentPurpose; granted: boolean; notice_version: string; created_at: string }>;
}

export async function recordConsent(sb: SupabaseClient, userId: string, purpose: ConsentPurpose, granted: boolean) {
  const { error } = await sb
    .from("consents")
    .insert({ user_id: userId, purpose, granted, notice_version: CONSENT_NOTICE_VERSION });
  if (error) throw new Error(`could not record consent: ${error.message}`);
}

/* -------------------------------- services ------------------------------- */

export async function listServices(sb: SupabaseClient): Promise<ServiceDefinition[]> {
  const { data } = await sb.from("services").select("definition").eq("enabled", true).order("slug");
  return ((data ?? []) as Array<{ definition: unknown }>).flatMap((r) => {
    const parsed = ServiceDefinition.safeParse(r.definition);
    return parsed.success ? [parsed.data] : [];
  });
}

export async function getService(sb: SupabaseClient, slug: string): Promise<ServiceDefinition | null> {
  const { data } = await sb.from("services").select("definition,enabled").eq("slug", slug).maybeSingle();
  if (data && (data as { enabled: boolean }).enabled) {
    const parsed = ServiceDefinition.safeParse((data as { definition: unknown }).definition);
    if (parsed.success) return parsed.data;
  }
  return data ? null : (getBundledService(slug) ?? null);
}

/* -------------------------------- documents ------------------------------ */

export interface DocumentRow {
  id: string;
  kind: string;
  mime: string;
  size_bytes: number;
  extraction_status: string;
  confirmed: boolean;
  created_at: string;
  expires_at: string;
  extracted_enc: string | null;
}

/** Latest non-expired, non-rejected document of each kind. */
export async function latestDocuments(sb: SupabaseClient, userId: string): Promise<DocumentRow[]> {
  const { data } = await sb
    .from("documents")
    .select("id,kind,mime,size_bytes,extraction_status,confirmed,created_at,expires_at,extracted_enc")
    .eq("user_id", userId)
    .neq("extraction_status", "rejected")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  const latest = new Map<string, DocumentRow>();
  for (const d of (data ?? []) as DocumentRow[]) if (!latest.has(d.kind)) latest.set(d.kind, d);
  return [...latest.values()];
}

export function decryptExtraction(userId: string, doc: DocumentRow): StoredExtraction | null {
  if (!doc.extracted_enc) return null;
  const parsed = StoredExtraction.safeParse(decryptJSON(doc.extracted_enc, aad.extraction(userId, doc.id)));
  return parsed.success ? parsed.data : null;
}
