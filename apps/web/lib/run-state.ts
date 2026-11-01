import { buildPlan, type ApprovalKind, type Localized, type RunStatus } from "@app/shared";
import { getService, latestDocuments, loadProfile } from "@/lib/data";
import { getOwnRun } from "@/lib/runs";
import { supabaseServer } from "@/lib/supabase/server";

export interface StepView {
  seq: number;
  step_id: string | null;
  action: string;
  target_label: string | null;
  value_redacted: string | null;
  result: "ok" | "error" | "retry" | "blocked" | "info" | "waiting";
  message: string | null;
  created_at: string;
  has_screenshot: boolean;
}

export interface FinalReviewSection {
  id: string;
  title: Localized;
  entries: Array<{ label: Localized; value: string }>;
  uploads: Localized[];
}

export interface ApprovalView {
  id: string;
  kind: ApprovalKind;
  prompt: string | null;
  expiresAt: string;
  stepTitle: Localized | null;
  /** Full values, assembled server-side for the owner only (final_submit). */
  sections?: FinalReviewSection[];
  mismatches?: string[];
}

export interface RunStateView {
  id: string;
  status: RunStatus;
  error: string | null;
  currentStep: string | null;
  control: string;
  updatedAt: string;
  createdAt: string;
  steps: StepView[];
  latestScreenshot: { url: string; seq: number; label: string | null } | null;
  approval: ApprovalView | null;
  hasReceipt: boolean;
  llmCalls: number;
  stepTitles: Record<string, Localized>;
}

/** Everything the live run view needs, read as the signed-in user (RLS) plus server-side decryption. */
export async function loadRunState(userId: string, runId: string): Promise<RunStateView | null> {
  const run = await getOwnRun(userId, runId);
  if (!run) return null;
  const sb = await supabaseServer();
  const [{ data: steps }, { data: approvals }, { data: receipt }, service] = await Promise.all([
    sb
      .from("run_steps")
      .select("seq,step_id,action,target_label,value_redacted,result,message,created_at,screenshot_key")
      .eq("run_id", runId)
      .order("seq", { ascending: true })
      .limit(500),
    sb
      .from("approvals")
      .select("id,kind,payload_redacted,expires_at,resolved_at")
      .eq("run_id", runId)
      .is("resolved_at", null)
      .order("requested_at", { ascending: false })
      .limit(1),
    sb.from("receipts").select("id").eq("run_id", runId).maybeSingle(),
    getService(sb, run.service_slug),
  ]);

  const rows = (steps ?? []) as Array<StepView & { screenshot_key: string | null }>;
  const lastShot = [...rows].reverse().find((s) => s.screenshot_key);
  let latestScreenshot: RunStateView["latestScreenshot"] = null;
  if (lastShot?.screenshot_key) {
    const { data } = await sb.storage.from("run-artifacts").createSignedUrl(lastShot.screenshot_key, 120);
    if (data?.signedUrl) latestScreenshot = { url: data.signedUrl, seq: lastShot.seq, label: lastShot.target_label };
  }

  let approval: ApprovalView | null = null;
  const open = (approvals ?? [])[0] as
    | { id: string; kind: ApprovalKind; payload_redacted: Record<string, unknown>; expires_at: string }
    | undefined;
  if (open && new Date(open.expires_at) > new Date()) {
    approval = {
      id: open.id,
      kind: open.kind,
      prompt: typeof open.payload_redacted.prompt === "string" ? open.payload_redacted.prompt : null,
      expiresAt: open.expires_at,
      stepTitle: (open.payload_redacted.stepTitle as Localized | undefined) ?? null,
    };
    if (open.kind === "final_submit" && service) {
      const [profile, docs] = await Promise.all([loadProfile(sb, userId), latestDocuments(sb, userId)]);
      const plan = buildPlan(service, profile, new Set(docs.map((d) => d.kind)));
      approval.sections = plan.steps
        .filter((s) => s.entries.length || s.uploads.length)
        .map((s) => ({
          id: s.id,
          title: s.title,
          entries: s.entries.map((e) => ({ label: e.label, value: e.value })),
          uploads: s.uploads.map((u) => u.label),
        }));
      approval.mismatches = Array.isArray(open.payload_redacted.mismatches)
        ? (open.payload_redacted.mismatches as string[])
        : [];
    }
  }

  return {
    id: run.id,
    status: run.status,
    error: run.error,
    currentStep: run.current_step,
    control: run.control,
    updatedAt: run.updated_at,
    createdAt: run.created_at,
    steps: rows.map(({ screenshot_key, ...s }) => ({ ...s, has_screenshot: Boolean(screenshot_key) })),
    latestScreenshot,
    approval,
    hasReceipt: Boolean(receipt),
    llmCalls: Number(run.llm_usage?.calls ?? 0),
    stepTitles: Object.fromEntries((service?.workflow.steps ?? []).map((s) => [s.id, s.title])),
  };
}
