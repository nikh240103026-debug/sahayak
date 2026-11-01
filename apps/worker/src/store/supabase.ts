import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  Profile,
  ServiceDefinition,
  type ApprovalKind,
  type ConsentPurpose,
  type RunStatus,
  type StoredExtraction,
} from "@app/shared";
import { aad, decryptJSON, decryptString, encryptJSON, sha256Hex } from "@app/shared/crypto";
import type {
  ApprovalState,
  DocumentRecord,
  LlmUsageDelta,
  RunRecord,
  RunStore,
  StepInput,
} from "./types";

const RUN_COLUMNS =
  "id,user_id,service_slug,status,current_step,control,chaos,manual_entry,idempotency_key,authorized_at,attempt";
const LEASE_SECONDS = 120;

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

export class SupabaseRunStore implements RunStore {
  private readonly db: SupabaseClient;
  private readonly seqByRun = new Map<string, number>();

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async claimNextRun(workerId: string): Promise<RunRecord | null> {
    const res = await this.db.rpc("claim_next_run", { p_worker_id: workerId, p_lease_seconds: LEASE_SECONDS });
    const rows = check(res, "claim_next_run") as RunRecord[] | null;
    return rows?.[0] ?? null;
  }

  async extendLease(runId: string, workerId: string): Promise<boolean> {
    const res = await this.db.rpc("extend_run_lease", {
      p_run_id: runId,
      p_worker_id: workerId,
      p_lease_seconds: LEASE_SECONDS,
    });
    return Boolean(check(res, "extend_run_lease"));
  }

  async expireStaleRuns(): Promise<number> {
    const res = await this.db.rpc("expire_stale_runs", { p_grace_seconds: 120 });
    return Number(check(res, "expire_stale_runs") ?? 0);
  }

  async getRun(runId: string): Promise<RunRecord | null> {
    const res = await this.db.from("runs").select(RUN_COLUMNS).eq("id", runId).maybeSingle();
    return check(res, "getRun") as RunRecord | null;
  }

  async setStatus(
    runId: string,
    status: RunStatus,
    patch: { current_step?: string | null; error?: string | null } = {},
  ): Promise<void> {
    const res = await this.db
      .from("runs")
      .update({ status, ...patch })
      .eq("id", runId);
    check(res, `setStatus(${status})`);
  }

  async setCurrentStep(runId: string, stepId: string | null): Promise<void> {
    check(await this.db.from("runs").update({ current_step: stepId }).eq("id", runId), "setCurrentStep");
  }

  async getService(slug: string): Promise<ServiceDefinition> {
    const res = await this.db.from("services").select("definition,enabled").eq("slug", slug).single();
    const row = check(res, "getService") as { definition: unknown; enabled: boolean };
    if (!row.enabled) throw new Error(`service ${slug} is disabled`);
    return ServiceDefinition.parse(row.definition);
  }

  async getProfile(userId: string): Promise<Profile> {
    const res = await this.db.from("profiles_private").select("data_enc").eq("user_id", userId).maybeSingle();
    const row = check(res, "getProfile") as { data_enc: string } | null;
    if (!row) return {};
    return Profile.parse(decryptJSON(row.data_enc, aad.profile(userId)));
  }

  async latestConsent(userId: string, purpose: ConsentPurpose): Promise<boolean> {
    const res = await this.db
      .from("consents")
      .select("granted")
      .eq("user_id", userId)
      .eq("purpose", purpose)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = check(res, "latestConsent") as { granted: boolean } | null;
    return row?.granted ?? false;
  }

  async getDocuments(userId: string): Promise<DocumentRecord[]> {
    const res = await this.db
      .from("documents")
      .select("id,user_id,kind,storage_key,sha256,mime,size_bytes,extraction_status")
      .eq("user_id", userId)
      .neq("extraction_status", "rejected")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    const rows = (check(res, "getDocuments") ?? []) as DocumentRecord[];
    const latest = new Map<string, DocumentRecord>();
    for (const r of rows) if (!latest.has(r.kind)) latest.set(r.kind, r);
    return [...latest.values()];
  }

  async downloadDocument(doc: DocumentRecord): Promise<Buffer> {
    const { data, error } = await this.db.storage.from("user-documents").download(doc.storage_key);
    if (error || !data) throw new Error(`download failed: ${error?.message ?? "no data"}`);
    const buf = Buffer.from(await data.arrayBuffer());
    // Documents are forwarded unchanged; refuse anything that does not match what the user uploaded.
    if (sha256Hex(buf) !== doc.sha256) throw new Error("document checksum mismatch");
    return buf;
  }

  async saveExtraction(
    doc: DocumentRecord,
    extraction: StoredExtraction | null,
    status: "done" | "skipped" | "failed" | "rejected",
  ): Promise<void> {
    const extracted_enc = extraction ? encryptJSON(extraction, aad.extraction(doc.user_id, doc.id)) : null;
    check(
      await this.db.from("documents").update({ extracted_enc, extraction_status: status }).eq("id", doc.id),
      "saveExtraction",
    );
  }

  async removeDocumentFile(doc: DocumentRecord): Promise<void> {
    await this.db.storage.from("user-documents").remove([doc.storage_key]);
  }

  private async nextSeq(runId: string): Promise<number> {
    if (!this.seqByRun.has(runId)) {
      const res = await this.db
        .from("run_steps")
        .select("seq")
        .eq("run_id", runId)
        .order("seq", { ascending: false })
        .limit(1)
        .maybeSingle();
      const row = check(res, "nextSeq") as { seq: number } | null;
      this.seqByRun.set(runId, row?.seq ?? 0);
    }
    const next = this.seqByRun.get(runId)! + 1;
    this.seqByRun.set(runId, next);
    return next;
  }

  async appendStep(run: RunRecord, step: StepInput): Promise<void> {
    const seq = await this.nextSeq(run.id);
    let screenshot_key: string | null = null;
    if (step.screenshot) {
      screenshot_key = `${run.user_id}/${run.id}/step-${String(seq).padStart(4, "0")}.jpg`;
      const up = await this.db.storage
        .from("run-artifacts")
        .upload(screenshot_key, step.screenshot, { contentType: "image/jpeg", upsert: true });
      if (up.error) screenshot_key = null;
    }
    check(
      await this.db.from("run_steps").insert({
        run_id: run.id,
        user_id: run.user_id,
        seq,
        step_id: step.step_id,
        action: step.action,
        target_label: step.target_label,
        value_redacted: step.value_redacted,
        result: step.result,
        message: step.message,
        screenshot_key,
      }),
      "appendStep",
    );
  }

  async createApproval(
    run: RunRecord,
    kind: ApprovalKind,
    payloadRedacted: Record<string, unknown>,
    expiresAt: Date,
  ): Promise<string> {
    const res = await this.db
      .from("approvals")
      .insert({
        run_id: run.id,
        user_id: run.user_id,
        kind,
        payload_redacted: payloadRedacted,
        expires_at: expiresAt.toISOString(),
      })
      .select("id")
      .single();
    return (check(res, "createApproval") as { id: string }).id;
  }

  async getApproval(approvalId: string): Promise<ApprovalState | null> {
    const res = await this.db
      .from("approvals")
      .select("decision,resolved_at,expires_at")
      .eq("id", approvalId)
      .maybeSingle();
    return check(res, "getApproval") as ApprovalState | null;
  }

  async takeApprovalResponse(run: RunRecord, approvalId: string): Promise<string | null> {
    const res = await this.db
      .from("approval_responses")
      .select("response_enc")
      .eq("approval_id", approvalId)
      .maybeSingle();
    const row = check(res, "takeApprovalResponse") as { response_enc: string } | null;
    if (!row) return null;
    await this.db.from("approval_responses").delete().eq("approval_id", approvalId);
    return decryptString(row.response_enc, aad.approvalResponse(run.id, approvalId));
  }

  async expireApproval(approvalId: string): Promise<void> {
    await this.db
      .from("approvals")
      .update({ decision: "expired", resolved_at: new Date().toISOString() })
      .eq("id", approvalId)
      .is("resolved_at", null);
  }

  async hasApprovedFinalSubmit(runId: string): Promise<boolean> {
    const res = await this.db
      .from("approvals")
      .select("id")
      .eq("run_id", runId)
      .eq("kind", "final_submit")
      .eq("decision", "approved")
      .limit(1);
    return ((check(res, "hasApprovedFinalSubmit") ?? []) as unknown[]).length > 0;
  }

  async getReceipt(runId: string): Promise<{ tracking_id: string } | null> {
    const res = await this.db.from("receipts").select("tracking_id").eq("run_id", runId).maybeSingle();
    return check(res, "getReceipt") as { tracking_id: string } | null;
  }

  async saveReceipt(
    run: RunRecord,
    receipt: { trackingId: string; pdf: Buffer; summaryEn: string; summaryHi: string },
  ): Promise<void> {
    const key = `${run.user_id}/${run.id}/receipt.pdf`;
    const up = await this.db.storage
      .from("run-artifacts")
      .upload(key, receipt.pdf, { contentType: "application/pdf", upsert: true });
    check(
      await this.db.from("receipts").upsert(
        {
          run_id: run.id,
          user_id: run.user_id,
          tracking_id: receipt.trackingId,
          receipt_pdf_key: up.error ? null : key,
          summary_en: receipt.summaryEn,
          summary_hi: receipt.summaryHi,
        },
        { onConflict: "run_id" },
      ),
      "saveReceipt",
    );
  }

  async addLlmUsage(runId: string, usage: LlmUsageDelta): Promise<void> {
    const res = await this.db.from("runs").select("llm_usage").eq("id", runId).single();
    const current = ((check(res, "addLlmUsage") as { llm_usage: Record<string, number> }).llm_usage ?? {}) as Record<
      string,
      number
    >;
    const next = {
      calls: (current.calls ?? 0) + 1,
      input_tokens: (current.input_tokens ?? 0) + usage.inputTokens,
      output_tokens: (current.output_tokens ?? 0) + usage.outputTokens,
      cost_usd: Number(((current.cost_usd ?? 0) + (usage.costUsd ?? 0)).toFixed(6)),
    };
    await this.db.from("runs").update({ llm_usage: next }).eq("id", runId);
  }
}
