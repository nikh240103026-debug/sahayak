import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Storage for the fictional demo portal. Supabase in deployments; an in-memory
 * store (DEMO_PORTAL_STORE=memory) for local agent tests that run without a database.
 */

export interface SessionRow {
  id: string;
  demo_id_hash: string;
  state_enc: string;
  chaos: string[];
  expires_at: string;
  created_at: string;
}

export interface ApplicationRow {
  tracking_id: string;
  idempotency_key: string | null;
  demo_id_hash: string;
  dob_hash: string;
  status: string;
  data_enc: string | null;
  uploads: unknown;
  submitted_at: string;
  data_expires_at: string;
}

export interface PortalStore {
  getSession(id: string): Promise<SessionRow | null>;
  latestSessionFor(demoIdHash: string, since: Date): Promise<SessionRow | null>;
  deleteSessionsFor(demoIdHash: string): Promise<void>;
  insertSession(row: Omit<SessionRow, "created_at">): Promise<void>;
  updateSession(id: string, patch: Partial<Pick<SessionRow, "state_enc" | "expires_at">>): Promise<void>;
  nextTrackingSeq(): Promise<number>;
  applicationByKey(key: string): Promise<ApplicationRow | null>;
  applicationByTracking(trackingId: string): Promise<ApplicationRow | null>;
  insertApplication(row: ApplicationRow): Promise<"ok" | "duplicate">;
  insertSms(mobileHash: string, messageEnc: string, expiresAt: Date): Promise<void>;
  latestSms(mobileHash: string): Promise<{ message_enc: string; created_at: string } | null>;
}

class SupabasePortalStore implements PortalStore {
  private get db() {
    return supabaseAdmin();
  }
  async getSession(id: string) {
    const { data } = await this.db.from("demo_portal_sessions").select("*").eq("id", id).maybeSingle();
    return (data as SessionRow | null) ?? null;
  }
  async latestSessionFor(demoIdHash: string, since: Date) {
    const { data } = await this.db
      .from("demo_portal_sessions")
      .select("*")
      .eq("demo_id_hash", demoIdHash)
      .gt("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as SessionRow | null) ?? null;
  }
  async deleteSessionsFor(demoIdHash: string) {
    await this.db.from("demo_portal_sessions").delete().eq("demo_id_hash", demoIdHash);
  }
  async insertSession(row: Omit<SessionRow, "created_at">) {
    const { error } = await this.db.from("demo_portal_sessions").insert(row);
    if (error) throw new Error(error.message);
  }
  async updateSession(id: string, patch: Partial<Pick<SessionRow, "state_enc" | "expires_at">>) {
    await this.db.from("demo_portal_sessions").update(patch).eq("id", id);
  }
  async nextTrackingSeq() {
    const { data, error } = await this.db.rpc("next_demo_tracking_seq");
    if (error) throw new Error(error.message);
    return Number(data);
  }
  async applicationByKey(key: string) {
    const { data } = await this.db.from("demo_applications").select("*").eq("idempotency_key", key).maybeSingle();
    return (data as ApplicationRow | null) ?? null;
  }
  async applicationByTracking(trackingId: string) {
    const { data } = await this.db.from("demo_applications").select("*").eq("tracking_id", trackingId).maybeSingle();
    return (data as ApplicationRow | null) ?? null;
  }
  async insertApplication(row: ApplicationRow) {
    const { error } = await this.db.from("demo_applications").insert(row);
    if (error?.code === "23505") return "duplicate";
    if (error) throw new Error(error.message);
    return "ok";
  }
  async insertSms(mobileHash: string, messageEnc: string, expiresAt: Date) {
    await this.db
      .from("demo_sms_outbox")
      .insert({ mobile_hash: mobileHash, message_enc: messageEnc, expires_at: expiresAt.toISOString() });
  }
  async latestSms(mobileHash: string) {
    const { data } = await this.db
      .from("demo_sms_outbox")
      .select("message_enc,created_at")
      .eq("mobile_hash", mobileHash)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as { message_enc: string; created_at: string } | null) ?? null;
  }
}

interface MemoryData {
  sessions: Map<string, SessionRow>;
  applications: ApplicationRow[];
  sms: Array<{ mobile_hash: string; message_enc: string; created_at: string; expires_at: string }>;
  seq: number;
}

/** Shared across route handlers and pages in the same dev/test server process. */
export function memoryData(): MemoryData {
  const g = globalThis as unknown as { __demoPortalMemory?: MemoryData };
  g.__demoPortalMemory ??= { sessions: new Map(), applications: [], sms: [], seq: 41 };
  return g.__demoPortalMemory;
}

class MemoryPortalStore implements PortalStore {
  private get m() {
    return memoryData();
  }
  async getSession(id: string) {
    return this.m.sessions.get(id) ?? null;
  }
  async latestSessionFor(demoIdHash: string, since: Date) {
    return (
      [...this.m.sessions.values()]
        .filter((s) => s.demo_id_hash === demoIdHash && new Date(s.created_at) > since)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
    );
  }
  async deleteSessionsFor(demoIdHash: string) {
    for (const [id, s] of this.m.sessions) if (s.demo_id_hash === demoIdHash) this.m.sessions.delete(id);
  }
  async insertSession(row: Omit<SessionRow, "created_at">) {
    this.m.sessions.set(row.id, { ...row, created_at: new Date().toISOString() });
  }
  async updateSession(id: string, patch: Partial<Pick<SessionRow, "state_enc" | "expires_at">>) {
    const s = this.m.sessions.get(id);
    if (s) this.m.sessions.set(id, { ...s, ...patch });
  }
  async nextTrackingSeq() {
    return ++this.m.seq;
  }
  async applicationByKey(key: string) {
    return this.m.applications.find((a) => a.idempotency_key === key) ?? null;
  }
  async applicationByTracking(trackingId: string) {
    return this.m.applications.find((a) => a.tracking_id === trackingId) ?? null;
  }
  async insertApplication(row: ApplicationRow) {
    if (row.idempotency_key && this.m.applications.some((a) => a.idempotency_key === row.idempotency_key)) {
      return "duplicate" as const;
    }
    this.m.applications.push(row);
    return "ok" as const;
  }
  async insertSms(mobileHash: string, messageEnc: string, expiresAt: Date) {
    this.m.sms.push({
      mobile_hash: mobileHash,
      message_enc: messageEnc,
      created_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    });
  }
  async latestSms(mobileHash: string) {
    const now = new Date().toISOString();
    return (
      this.m.sms
        .filter((s) => s.mobile_hash === mobileHash && s.expires_at > now)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
    );
  }
}

let store: PortalStore | null = null;

export function portalStore(): PortalStore {
  store ??= process.env.DEMO_PORTAL_STORE === "memory" ? new MemoryPortalStore() : new SupabasePortalStore();
  return store;
}
