import type {
  ApprovalDecision,
  ApprovalKind,
  ConsentPurpose,
  Profile,
  RunControl,
  RunStatus,
  RunStepRecord,
  ServiceDefinition,
  StoredExtraction,
} from "@app/shared";

export interface RunRecord {
  id: string;
  user_id: string;
  service_slug: string;
  status: RunStatus;
  current_step: string | null;
  control: RunControl;
  chaos: boolean;
  manual_entry: boolean;
  idempotency_key: string;
  authorized_at: string | null;
  attempt: number;
}

export interface DocumentRecord {
  id: string;
  user_id: string;
  kind: string;
  storage_key: string;
  sha256: string;
  mime: "application/pdf" | "image/jpeg" | "image/png";
  size_bytes: number;
  extraction_status: string;
}

export interface ApprovalState {
  decision: ApprovalDecision | null;
  resolved_at: string | null;
  expires_at: string;
}

export interface LlmUsageDelta {
  purpose: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
}

export interface StepInput extends RunStepRecord {
  screenshot?: Buffer;
}

/**
 * Everything the worker needs from storage. Implemented over Supabase for real
 * runs and in memory for tests, so the executor can be exercised end to end
 * against the demo portal without a database.
 */
export interface RunStore {
  claimNextRun(workerId: string): Promise<RunRecord | null>;
  extendLease(runId: string, workerId: string): Promise<boolean>;
  expireStaleRuns(): Promise<number>;
  getRun(runId: string): Promise<RunRecord | null>;
  setStatus(
    runId: string,
    status: RunStatus,
    patch?: { current_step?: string | null; error?: string | null },
  ): Promise<void>;
  setCurrentStep(runId: string, stepId: string | null): Promise<void>;

  getService(slug: string): Promise<ServiceDefinition>;
  getProfile(userId: string): Promise<Profile>;
  latestConsent(userId: string, purpose: ConsentPurpose): Promise<boolean>;

  getDocuments(userId: string): Promise<DocumentRecord[]>;
  downloadDocument(doc: DocumentRecord): Promise<Buffer>;
  saveExtraction(
    doc: DocumentRecord,
    extraction: StoredExtraction | null,
    status: "done" | "skipped" | "failed" | "rejected",
  ): Promise<void>;
  removeDocumentFile(doc: DocumentRecord): Promise<void>;

  appendStep(run: RunRecord, step: StepInput): Promise<void>;

  createApproval(
    run: RunRecord,
    kind: ApprovalKind,
    payloadRedacted: Record<string, unknown>,
    expiresAt: Date,
  ): Promise<string>;
  getApproval(approvalId: string): Promise<ApprovalState | null>;
  takeApprovalResponse(run: RunRecord, approvalId: string): Promise<string | null>;
  expireApproval(approvalId: string): Promise<void>;
  hasApprovedFinalSubmit(runId: string): Promise<boolean>;

  getReceipt(runId: string): Promise<{ tracking_id: string } | null>;
  saveReceipt(
    run: RunRecord,
    receipt: { trackingId: string; pdf: Buffer; summaryEn: string; summaryHi: string },
  ): Promise<void>;

  addLlmUsage(runId: string, usage: LlmUsageDelta): Promise<void>;
}
