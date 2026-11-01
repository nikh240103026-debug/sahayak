import {
  buildPlan,
  evaluateEligibility,
  type ApprovalKind,
  type RunControl,
  type RunStatus,
} from "@app/shared";
import { aad, encryptString } from "@app/shared/crypto";
import { env } from "@/lib/env";
import { getService, latestDocuments, loadConsents, loadProfile } from "@/lib/data";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { wakeWorker } from "@/lib/worker";

/**
 * Run state changes initiated by the applicant. These use the service role
 * (users cannot write runs directly) and always check ownership first.
 */

export class UserFacingError extends Error {}

export interface RunRow {
  id: string;
  user_id: string;
  service_slug: string;
  status: RunStatus;
  current_step: string | null;
  error: string | null;
  control: RunControl;
  chaos: boolean;
  manual_entry: boolean;
  authorized_at: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
  llm_usage: Record<string, number>;
}

const RUN_COLS =
  "id,user_id,service_slug,status,current_step,error,control,chaos,manual_entry,authorized_at,created_at,updated_at,finished_at,llm_usage";

export async function getOwnRun(userId: string, runId: string): Promise<RunRow | null> {
  if (!/^[0-9a-f-]{36}$/.test(runId)) return null;
  const { data } = await supabaseAdmin().from("runs").select(RUN_COLS).eq("id", runId).eq("user_id", userId).maybeSingle();
  return (data as RunRow | null) ?? null;
}

export async function createRun(
  userId: string,
  slug: string,
  opts: { chaos: boolean; manualEntry: boolean },
): Promise<{ id: string; status: RunStatus; workerWoken: boolean }> {
  const sb = await supabaseServer();
  const service = await getService(sb, slug);
  if (!service) throw new UserFacingError("This service is not available right now.");
  const consents = await loadConsents(sb, userId);
  if (!consents.store_profile.granted) {
    throw new UserFacingError("Please allow us to keep your profile (Settings) so we can fill the form for you.");
  }
  const admin = supabaseAdmin();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await admin
    .from("runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  if ((count ?? 0) >= env().MAX_RUNS_PER_USER_PER_DAY) {
    throw new UserFacingError(
      `You have started ${env().MAX_RUNS_PER_USER_PER_DAY} applications in the last 24 hours. Please try again tomorrow.`,
    );
  }
  const docs = await latestDocuments(sb, userId);
  const missing = service.requiredDocs.filter((d) => !docs.some((x) => x.kind === d.kind));
  if (missing.length) throw new UserFacingError(`Please upload: ${missing.map((d) => d.label.en).join(", ")}.`);

  const manual = opts.manualEntry || !consents.ai_processing.granted || env().LLM_DISABLED;
  const status: RunStatus = manual ? "NEEDS_PROFILE_CONFIRM" : "QUEUED";
  const { data, error } = await admin
    .from("runs")
    .insert({
      user_id: userId,
      service_slug: slug,
      service_version: service.version,
      status,
      chaos: opts.chaos,
      manual_entry: manual,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`could not create run: ${error?.message}`);
  const workerWoken = manual ? false : await wakeWorker();
  return { id: (data as { id: string }).id, status, workerWoken };
}

/** NEEDS_PROFILE_CONFIRM -> QUEUED: read the (new) documents again. */
export async function rereadDocuments(userId: string, runId: string): Promise<void> {
  const run = await getOwnRun(userId, runId);
  if (!run || run.status !== "NEEDS_PROFILE_CONFIRM") throw new UserFacingError("This application cannot read documents right now.");
  const { error } = await supabaseAdmin()
    .from("runs")
    .update({ status: "QUEUED", manual_entry: false, error: null, lease_until: null })
    .eq("id", runId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  await wakeWorker();
}

/**
 * The applicant's explicit, per-run authorisation for the assistant to act on
 * the portal. Re-checks consent, profile completeness and eligibility.
 */
export async function startRun(userId: string, runId: string): Promise<void> {
  const run = await getOwnRun(userId, runId);
  if (!run) throw new UserFacingError("We could not find that application.");
  if (!["NEEDS_PROFILE_CONFIRM", "FAILED", "PAUSED_EXPIRED"].includes(run.status)) {
    throw new UserFacingError("This application is already running or finished.");
  }
  const sb = await supabaseServer();
  const consents = await loadConsents(sb, userId);
  if (!consents.agent_actions.granted) {
    throw new UserFacingError("Please allow the assistant to act on the portal for you (Settings) before starting.");
  }
  const service = await getService(sb, run.service_slug);
  if (!service) throw new UserFacingError("This service is not available right now.");
  const [profile, docs] = await Promise.all([loadProfile(sb, userId), latestDocuments(sb, userId)]);
  const kinds = new Set(docs.map((d) => d.kind));
  const plan = buildPlan(service, profile, kinds);
  if (!plan.ready) throw new UserFacingError("Some details or documents are still missing. Please complete them first.");
  const eligibility = evaluateEligibility(service, profile, kinds);
  if (eligibility.overall === "not_eligible") {
    throw new UserFacingError("Your details do not meet this scheme's rules, so we will not apply.");
  }
  const { error } = await supabaseAdmin()
    .from("runs")
    .update({
      status: "PLANNING",
      authorized_at: new Date().toISOString(),
      control: "none",
      error: null,
      lease_until: null,
      current_step: null,
    })
    .eq("id", runId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  await wakeWorker();
}

export async function controlRun(userId: string, runId: string, control: RunControl): Promise<void> {
  const run = await getOwnRun(userId, runId);
  if (!run) throw new UserFacingError("We could not find that application.");
  const admin = supabaseAdmin();
  const cancelled = { status: "CANCELLED", control: "cancel", error: "You cancelled this application. Nothing was submitted." };
  if (control === "cancel") {
    if (run.status === "COMPLETED" || run.status === "CANCELLED") return;
    const workerOwned = ["EXTRACTING", "EXECUTING", "AWAITING_HUMAN", "AWAITING_FINAL_APPROVAL", "SUBMITTING"];
    if (!workerOwned.includes(run.status)) {
      // Not claimed by a worker (or its lease lapsed): cancel directly.
      const { data } = await admin
        .from("runs")
        .update(cancelled)
        .eq("id", runId)
        .eq("user_id", userId)
        .or(`lease_until.is.null,lease_until.lt.${new Date().toISOString()}`)
        .select("id");
      if ((data ?? []).length > 0) return;
    }
  }
  if (run.status === "SUBMITTING" && control !== "none") {
    throw new UserFacingError("We are submitting right now and cannot stop halfway. Please wait a moment.");
  }
  await admin.from("runs").update({ control }).eq("id", runId).eq("user_id", userId);
}

/**
 * Resolve the open checkpoint. OTP/CAPTCHA answers are stored encrypted in a
 * service-only table and deleted by the worker as soon as it types them.
 */
export async function resolveApproval(
  userId: string,
  runId: string,
  approvalId: string,
  decision: "approved" | "rejected" | "provided",
  response: string | null,
): Promise<void> {
  const run = await getOwnRun(userId, runId);
  if (!run) throw new UserFacingError("We could not find that application.");
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("approvals")
    .select("id,kind,resolved_at,expires_at")
    .eq("id", approvalId)
    .eq("run_id", runId)
    .eq("user_id", userId)
    .maybeSingle();
  const approval = data as { id: string; kind: ApprovalKind; resolved_at: string | null; expires_at: string } | null;
  if (!approval || approval.resolved_at) throw new UserFacingError("This step has already been handled.");
  if (new Date(approval.expires_at) < new Date()) throw new UserFacingError("This step timed out. Please restart the application.");
  if (approval.kind === "final_submit" && decision === "provided") throw new UserFacingError("Please approve or go back.");
  if (approval.kind !== "final_submit" && decision === "approved") throw new UserFacingError("Please type the answer.");
  if (decision === "provided") {
    const answer = (response ?? "").trim();
    if (!answer || answer.length > 32) throw new UserFacingError("Please type the answer exactly as shown.");
    const { error } = await admin.from("approval_responses").upsert({
      approval_id: approvalId,
      response_enc: encryptString(answer, aad.approvalResponse(runId, approvalId)),
    });
    if (error) throw new Error(error.message);
  }
  const { error } = await admin
    .from("approvals")
    .update({ decision, resolved_at: new Date().toISOString() })
    .eq("id", approvalId)
    .is("resolved_at", null);
  if (error) throw new Error(error.message);
}
