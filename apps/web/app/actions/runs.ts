"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { checkValue, fieldsUsedByService, normalizeValue, type Profile } from "@app/shared";
import { requireOnboarded } from "@/lib/auth";
import { getService, latestDocuments, loadProfile, saveProfile } from "@/lib/data";
import {
  UserFacingError,
  controlRun,
  createRun,
  getOwnRun,
  rereadDocuments,
  resolveApproval,
  startRun,
} from "@/lib/runs";
import { supabaseServer } from "@/lib/supabase/server";

export interface ActionState {
  error?: string;
  ok?: boolean;
  fieldErrors?: Record<string, "invalid" | "pattern" | "required">;
  values?: Record<string, string>;
}

function friendly(e: unknown): string {
  if (e instanceof UserFacingError) return e.message;
  return "Something went wrong on our side. Please try again in a moment.";
}

export async function createRunAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireOnboarded();
  const slug = String(formData.get("slug") ?? "");
  let id: string;
  try {
    ({ id } = await createRun(user.id, slug, {
      chaos: formData.get("chaos") === "on",
      manualEntry: formData.get("mode") === "manual",
    }));
  } catch (e) {
    return { error: friendly(e) };
  }
  redirect(`/app/runs/${id}`);
}

/** Save the user's field-by-field confirmation. Only these confirmed values are ever typed by the agent. */
export async function confirmProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireOnboarded();
  const runId = String(formData.get("runId") ?? "");
  const run = await getOwnRun(user.id, runId);
  if (!run || run.status !== "NEEDS_PROFILE_CONFIRM") return { error: "This application is not waiting for your details." };
  const sb = await supabaseServer();
  const service = await getService(sb, run.service_slug);
  if (!service) return { error: "This service is not available right now." };

  const values: Record<string, string> = {};
  const fieldErrors: ActionState["fieldErrors"] = {};
  const sources: Record<string, string> = {};
  for (const field of fieldsUsedByService(service)) {
    const raw = String(formData.get(`f_${field.key}`) ?? "").trim();
    values[field.key] = raw;
    sources[field.key] = String(formData.get(`s_${field.key}`) ?? "manual").slice(0, 100);
    if (!raw) {
      if (field.required) fieldErrors[field.key] = "required";
      continue;
    }
    const problem = checkValue(field, raw);
    if (problem) fieldErrors[field.key] = problem;
  }
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  const now = new Date().toISOString();
  const profile: Profile = await loadProfile(sb, user.id);
  for (const field of fieldsUsedByService(service)) {
    const v = normalizeValue(field, values[field.key]);
    if (v === null) continue;
    const source = /^document:[0-9a-f-]{36}$/.test(sources[field.key] ?? "") ? sources[field.key]! : "manual";
    profile[field.key] = { value: v, source, confirmed: true, confirmedAt: now };
  }
  try {
    await saveProfile(sb, user.id, profile, true);
    const docs = await latestDocuments(sb, user.id);
    if (docs.length) await sb.from("documents").update({ confirmed: true }).in("id", docs.map((d) => d.id));
  } catch (e) {
    return { error: friendly(e) };
  }
  revalidatePath(`/app/runs/${runId}`);
  return { ok: true };
}

export async function startRunAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireOnboarded();
  const runId = String(formData.get("runId") ?? "");
  if (formData.get("authorise") !== "on") return { error: "Please tick the box to authorise this one application." };
  try {
    await startRun(user.id, runId);
  } catch (e) {
    return { error: friendly(e) };
  }
  revalidatePath(`/app/runs/${runId}`);
  return { ok: true };
}

export async function controlRunAction(formData: FormData): Promise<void> {
  const { user } = await requireOnboarded();
  const runId = String(formData.get("runId") ?? "");
  const control = formData.get("control");
  if (control === "pause" || control === "cancel" || control === "none") {
    await controlRun(user.id, runId, control).catch(() => undefined);
  }
  revalidatePath(`/app/runs/${runId}`);
}

export async function rereadAction(formData: FormData): Promise<void> {
  const { user } = await requireOnboarded();
  const runId = String(formData.get("runId") ?? "");
  await rereadDocuments(user.id, runId).catch(() => undefined);
  revalidatePath(`/app/runs/${runId}`);
}

export async function resolveApprovalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireOnboarded();
  const runId = String(formData.get("runId") ?? "");
  const approvalId = String(formData.get("approvalId") ?? "");
  const decision = formData.get("decision");
  if (decision !== "approved" && decision !== "rejected" && decision !== "provided") return { error: "Please choose an option." };
  try {
    await resolveApproval(user.id, runId, approvalId, decision, String(formData.get("response") ?? "") || null);
  } catch (e) {
    return { error: friendly(e) };
  }
  return { ok: true };
}
