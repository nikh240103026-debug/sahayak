import type { Profile, ProposedAction, ServiceDefinition, WorkflowAction, WorkflowStep } from "./schemas";
import type { EgressAllowlist } from "./egress";
import { isUrlAllowed } from "./egress";
import { allowedValuesForStep, confirmedValue } from "./workflow";
import { namedVariants } from "./values";

/** One interactive element in the page snapshot we give the model. */
export interface SnapshotElement {
  ref: string;
  role: string;
  name: string;
  id: string | null;
  tag: string;
  inputType: string | null;
  /** Current value; masked for sensitive inputs. */
  value: string | null;
  options?: string[];
  href?: string | null;
  disabled: boolean;
  inDialog: boolean;
}

export interface PageSnapshot {
  url: string;
  title: string;
  headings: string[];
  alerts: string[];
  dialogs: string[];
  elements: SnapshotElement[];
  /** Visible text, truncated. Untrusted. */
  text: string;
}

export type ValidatedAction =
  | { type: "goto"; url: string }
  | { type: "click"; ref: string; label: string }
  | { type: "fill"; ref: string; field: string; value: string }
  | { type: "select"; ref: string; field: string; value: string }
  | { type: "check"; ref: string; label: string }
  | { type: "upload"; ref: string; doc: string }
  | { type: "press"; key: "Enter" | "Tab" | "Escape" }
  | { type: "wait"; ms: number }
  | { type: "request_human"; reason: string }
  | { type: "finish" };

export type ValidationResult = { ok: true; action: ValidatedAction } | { ok: false; reason: string };

export interface ValidationContext {
  service: ServiceDefinition;
  step: WorkflowStep;
  profile: Profile;
  snapshot: PageSnapshot;
  allowlist: EgressAllowlist;
  baseUrl: string;
  finalApprovalGranted: boolean;
}

/** Harmless controls the agent may press on any page to get a notice out of the way. */
export const GLOBAL_DISMISS_LABELS = [
  "ok",
  "close",
  "dismiss",
  "i understand",
  "i have read the notice",
  "got it",
  "continue",
];

const ALLOWED_KEYS = new Set(["Enter", "Tab", "Escape"]);
const MAX_WAIT_MS = 5000;

export function normalizeLabel(s: string): string {
  return s
    .toLowerCase()
    .replace(/[*:()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesTarget(el: SnapshotElement, selector: string, label: string): boolean {
  if (el.id && selector === `#${el.id}`) return true;
  const name = normalizeLabel(el.name);
  const want = normalizeLabel(label);
  return want.length >= 3 && name.length > 0 && (name === want || name.startsWith(want));
}

type TargetAction = Extract<WorkflowAction, { selector: string }>;

function stepTargets(step: WorkflowStep): TargetAction[] {
  return step.actions.filter((a): a is TargetAction => "selector" in a);
}

/** Every final-submit control in the whole workflow. */
function submitTargets(service: ServiceDefinition): Array<{ selector: string; label: string }> {
  const out: Array<{ selector: string; label: string }> = [];
  for (const s of service.workflow.steps) {
    for (const a of s.actions) {
      if (a.do === "submit") out.push({ selector: a.selector, label: a.label });
      if (a.do === "check" && a.requiresApproval) out.push({ selector: a.selector, label: a.label });
    }
  }
  return out;
}

const SUBMIT_WORDS = /\b(final submit|submit application|submit form|lock and submit)\b/i;

/**
 * Validate one model-proposed action. Rejects anything outside the current
 * step's field map, off the egress allowlist, or carrying a value that is not
 * a confirmed profile value (or a pure format variant of one).
 */
export function validateProposedAction(p: ProposedAction, ctx: ValidationContext): ValidationResult {
  const { step, snapshot } = ctx;
  const el = p.ref ? snapshot.elements.find((e) => e.ref === p.ref) : undefined;
  const needsElement = ["click", "fill", "select", "check", "upload"].includes(p.type);
  if (needsElement && !el) return { ok: false, reason: `element ${p.ref ?? "(none)"} is not on the page` };
  if (el?.disabled) return { ok: false, reason: "element is disabled" };

  const isSubmitControl = (e: SnapshotElement) =>
    SUBMIT_WORDS.test(e.name) || submitTargets(ctx.service).some((t) => matchesTarget(e, t.selector, t.label));
  const submitAllowed = step.phase === "submit" && ctx.finalApprovalGranted;

  switch (p.type) {
    case "goto": {
      if (!p.url) return { ok: false, reason: "goto needs a url" };
      let abs: string;
      try {
        abs = new URL(p.url, ctx.baseUrl).toString();
      } catch {
        return { ok: false, reason: "invalid url" };
      }
      if (!isUrlAllowed(abs, ctx.allowlist)) return { ok: false, reason: "url is not on the allowlist" };
      return { ok: true, action: { type: "goto", url: abs } };
    }

    case "fill":
    case "select": {
      const target = stepTargets(step).find(
        (a) => (a.do === "fill" || a.do === "select") && matchesTarget(el!, a.selector, a.label),
      );
      if (!target || (target.do !== "fill" && target.do !== "select")) {
        return { ok: false, reason: "element is outside this step's field map" };
      }
      if (p.field && p.field !== target.field) {
        return { ok: false, reason: `element belongs to field ${target.field}, not ${p.field}` };
      }
      const confirmed = confirmedValue(ctx.profile, target.field);
      const def = ctx.service.fields.find((f) => f.key === target.field);
      if (confirmed === null || !def) {
        return { ok: false, reason: `field ${target.field} has no confirmed value` };
      }
      let value: string | null = p.value;
      if (p.format) {
        const named = namedVariants(def, confirmed).find((v) => v.format === p.format);
        if (!named) return { ok: false, reason: `format ${p.format} does not apply to ${target.field}` };
        value = named.value;
      }
      if (value == null) return { ok: false, reason: "no value given" };
      const allowed = allowedValuesForStep(ctx.service, step, ctx.profile).get(target.field);
      if (!allowed?.has(value)) {
        return { ok: false, reason: `value for ${target.field} is not a confirmed profile value` };
      }
      if (p.type === "select") {
        const opts = (el!.options ?? []).map(normalizeLabel);
        if (!opts.includes(normalizeLabel(value))) return { ok: false, reason: "option is not in the list" };
      }
      return { ok: true, action: { type: p.type, ref: el!.ref, field: target.field, value } };
    }

    case "click": {
      if (isSubmitControl(el!) && !submitAllowed) {
        return { ok: false, reason: "final submit is only allowed after the applicant approves" };
      }
      if (el!.href && !isUrlAllowed(new URL(el!.href, ctx.baseUrl).toString(), ctx.allowlist)) {
        return { ok: false, reason: "link leads off the allowlist" };
      }
      const name = normalizeLabel(el!.name);
      const allowedLabels = [...step.allowedClicks.map(normalizeLabel), ...GLOBAL_DISMISS_LABELS];
      const declared = stepTargets(step).some((a) => a.do === "click" && matchesTarget(el!, a.selector, a.label));
      if (!declared && !allowedLabels.some((l) => name === l || name.startsWith(l))) {
        return { ok: false, reason: `"${el!.name}" is not a control this step may press` };
      }
      return { ok: true, action: { type: "click", ref: el!.ref, label: el!.name } };
    }

    case "check": {
      const target = stepTargets(step).find((a) => a.do === "check" && matchesTarget(el!, a.selector, a.label));
      if (!target || target.do !== "check") return { ok: false, reason: "checkbox is outside this step's field map" };
      if (target.requiresApproval && !submitAllowed) {
        return { ok: false, reason: "this declaration needs the applicant's final approval first" };
      }
      return { ok: true, action: { type: "check", ref: el!.ref, label: target.label } };
    }

    case "upload": {
      const target = stepTargets(step).find((a) => a.do === "upload" && matchesTarget(el!, a.selector, a.label));
      if (!target || target.do !== "upload") return { ok: false, reason: "file input is outside this step's field map" };
      if (p.doc && p.doc !== target.doc) return { ok: false, reason: `this input takes ${target.doc}, not ${p.doc}` };
      return { ok: true, action: { type: "upload", ref: el!.ref, doc: target.doc } };
    }

    case "press": {
      if (!p.key || !ALLOWED_KEYS.has(p.key)) return { ok: false, reason: "key is not allowed" };
      return { ok: true, action: { type: "press", key: p.key as "Enter" | "Tab" | "Escape" } };
    }

    case "wait": {
      const ms = Math.round(p.wait_ms ?? 1000);
      if (ms < 0 || ms > MAX_WAIT_MS) return { ok: false, reason: `wait must be between 0 and ${MAX_WAIT_MS} ms` };
      return { ok: true, action: { type: "wait", ms } };
    }

    case "request_human":
      return { ok: true, action: { type: "request_human", reason: p.reason.slice(0, 300) } };

    case "finish":
      return { ok: true, action: { type: "finish" } };
  }
}
