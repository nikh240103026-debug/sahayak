import {
  canTransition,
  type ApprovalDecision,
  type ApprovalKind,
  type ConsentPurpose,
  type Profile,
  type RunStatus,
  type ServiceDefinition,
  type StoredExtraction,
} from "@app/shared";
import type { ApprovalState, DocumentRecord, LlmUsageDelta, RunRecord, RunStore, StepInput } from "./types";

export interface MemoryApproval {
  id: string;
  runId: string;
  kind: ApprovalKind;
  payload: Record<string, unknown>;
  expiresAt: Date;
  decision: ApprovalDecision | null;
  resolvedAt: Date | null;
  response: string | null;
}

/** Called when the worker asks a human for something; tests use it to play the applicant. */
export type HumanResponder = (approval: MemoryApproval, store: MemoryRunStore) => void | Promise<void>;

/** In-memory RunStore used by tests and the local agent e2e. Mirrors the database rules that matter. */
export class MemoryRunStore implements RunStore {
  runs = new Map<string, RunRecord>();
  errors = new Map<string, string | null>();
  services = new Map<string, ServiceDefinition>();
  profiles = new Map<string, Profile>();
  consents = new Map<string, Partial<Record<ConsentPurpose, boolean>>>();
  documents: Array<DocumentRecord & { bytes: Buffer; extraction?: StoredExtraction | null }> = [];
  steps: Array<StepInput & { runId: string; seq: number }> = [];
  approvals: MemoryApproval[] = [];
  receipts = new Map<string, { trackingId: string; pdf: Buffer; summaryEn: string; summaryHi: string }>();
  usage: LlmUsageDelta[] = [];
  statusHistory: Array<{ runId: string; status: RunStatus }> = [];
  responder: HumanResponder | null = null;

  async claimNextRun(): Promise<RunRecord | null> {
    for (const r of this.runs.values()) {
      if (r.status === "QUEUED" || (r.status === "PLANNING" && r.authorized_at)) return { ...r };
    }
    return null;
  }
  async extendLease(): Promise<boolean> {
    return true;
  }
  async expireStaleRuns(): Promise<number> {
    return 0;
  }
  async getRun(runId: string): Promise<RunRecord | null> {
    const r = this.runs.get(runId);
    return r ? { ...r } : null;
  }
  async setStatus(
    runId: string,
    status: RunStatus,
    patch: { current_step?: string | null; error?: string | null } = {},
  ): Promise<void> {
    const r = this.runs.get(runId);
    if (!r) throw new Error("no such run");
    if (!canTransition(r.status, status)) throw new Error(`invalid run status transition ${r.status} -> ${status}`);
    if (status === "SUBMITTING" && !(await this.hasApprovedFinalSubmit(runId))) {
      throw new Error("final approval is required before submitting");
    }
    r.status = status;
    if (patch.current_step !== undefined) r.current_step = patch.current_step;
    if (patch.error !== undefined) this.errors.set(runId, patch.error);
    this.statusHistory.push({ runId, status });
  }
  async setCurrentStep(runId: string, stepId: string | null): Promise<void> {
    const r = this.runs.get(runId);
    if (r) r.current_step = stepId;
  }
  async getService(slug: string): Promise<ServiceDefinition> {
    const s = this.services.get(slug);
    if (!s) throw new Error(`no service ${slug}`);
    return s;
  }
  async getProfile(userId: string): Promise<Profile> {
    return this.profiles.get(userId) ?? {};
  }
  async latestConsent(userId: string, purpose: ConsentPurpose): Promise<boolean> {
    return this.consents.get(userId)?.[purpose] ?? false;
  }
  async getDocuments(userId: string): Promise<DocumentRecord[]> {
    return this.documents.filter((d) => d.user_id === userId && d.extraction_status !== "rejected");
  }
  async downloadDocument(doc: DocumentRecord): Promise<Buffer> {
    const d = this.documents.find((x) => x.id === doc.id);
    if (!d) throw new Error("no such document");
    return d.bytes;
  }
  async saveExtraction(
    doc: DocumentRecord,
    extraction: StoredExtraction | null,
    status: "done" | "skipped" | "failed" | "rejected",
  ): Promise<void> {
    const d = this.documents.find((x) => x.id === doc.id);
    if (d) {
      d.extraction = extraction;
      d.extraction_status = status;
    }
  }
  async removeDocumentFile(): Promise<void> {}
  async appendStep(run: RunRecord, step: StepInput): Promise<void> {
    const seq = this.steps.filter((s) => s.runId === run.id).length + 1;
    this.steps.push({ ...step, runId: run.id, seq });
  }
  async createApproval(
    run: RunRecord,
    kind: ApprovalKind,
    payload: Record<string, unknown>,
    expiresAt: Date,
  ): Promise<string> {
    if (this.approvals.some((a) => a.runId === run.id && a.resolvedAt === null)) {
      throw new Error("an approval is already open for this run");
    }
    const approval: MemoryApproval = {
      id: `appr-${this.approvals.length + 1}`,
      runId: run.id,
      kind,
      payload,
      expiresAt,
      decision: null,
      resolvedAt: null,
      response: null,
    };
    this.approvals.push(approval);
    if (this.responder) setTimeout(() => void this.responder?.(approval, this), 10);
    return approval.id;
  }
  /** Test helper: resolve an approval the way the web app would. */
  resolve(approvalId: string, decision: ApprovalDecision, response: string | null = null) {
    const a = this.approvals.find((x) => x.id === approvalId);
    if (!a || a.resolvedAt) return;
    a.decision = decision;
    a.resolvedAt = new Date();
    a.response = response;
  }
  async getApproval(approvalId: string): Promise<ApprovalState | null> {
    const a = this.approvals.find((x) => x.id === approvalId);
    return a
      ? { decision: a.decision, resolved_at: a.resolvedAt?.toISOString() ?? null, expires_at: a.expiresAt.toISOString() }
      : null;
  }
  async takeApprovalResponse(_run: RunRecord, approvalId: string): Promise<string | null> {
    const a = this.approvals.find((x) => x.id === approvalId);
    const r = a?.response ?? null;
    if (a) a.response = null;
    return r;
  }
  async expireApproval(approvalId: string): Promise<void> {
    this.resolve(approvalId, "expired");
  }
  async hasApprovedFinalSubmit(runId: string): Promise<boolean> {
    return this.approvals.some((a) => a.runId === runId && a.kind === "final_submit" && a.decision === "approved");
  }
  async getReceipt(runId: string): Promise<{ tracking_id: string } | null> {
    const r = this.receipts.get(runId);
    return r ? { tracking_id: r.trackingId } : null;
  }
  async saveReceipt(
    run: RunRecord,
    receipt: { trackingId: string; pdf: Buffer; summaryEn: string; summaryHi: string },
  ): Promise<void> {
    this.receipts.set(run.id, receipt);
  }
  async addLlmUsage(_runId: string, usage: LlmUsageDelta): Promise<void> {
    this.usage.push(usage);
  }
}
