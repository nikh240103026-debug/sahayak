import type {
  Confidence,
  FieldDef,
  Localized,
  Profile,
  ServiceDefinition,
  StoredExtraction,
  WorkflowStep,
} from "./schemas";
import { formatValue, normalizeValue, valueVariants } from "./values";

export function fieldMap(service: ServiceDefinition): Map<string, FieldDef> {
  return new Map(service.fields.map((f) => [f.key, f]));
}

/**
 * Purpose limitation: the only profile fields a service may collect are the
 * ones its workflow types or its eligibility rules read.
 */
export function fieldsUsedByService(service: ServiceDefinition): FieldDef[] {
  const used = new Set<string>();
  for (const step of service.workflow.steps) {
    for (const a of step.actions) if (a.do === "fill" || a.do === "select") used.add(a.field);
  }
  for (const r of service.eligibility.rules) used.add(r.field);
  return service.fields.filter((f) => used.has(f.key));
}

/** A confirmed value, or null. Unconfirmed values are never used by the agent. */
export function confirmedValue(profile: Profile, key: string): string | null {
  const entry = profile[key];
  return entry && entry.confirmed && entry.value.trim() !== "" ? entry.value : null;
}

export interface PlanEntry {
  field: string;
  label: Localized;
  portalLabel: string;
  value: string;
  sensitive: boolean;
  selector: string;
  kind: "fill" | "select";
}

export interface PlanUpload {
  doc: string;
  label: Localized;
  selector: string;
}

export interface PlannedStep {
  id: string;
  title: Localized;
  phase: WorkflowStep["phase"];
  entries: PlanEntry[];
  uploads: PlanUpload[];
  humanCheckpoints: Array<"captcha" | "otp" | "final_submit">;
}

export interface Plan {
  steps: PlannedStep[];
  missingFields: FieldDef[];
  missingDocs: string[];
  ready: boolean;
}

/**
 * Map the confirmed profile onto the workflow. Any required field without a
 * confirmed source value is reported as missing: the agent stops and asks.
 */
export function buildPlan(
  service: ServiceDefinition,
  profile: Profile,
  availableDocs: ReadonlySet<string>,
): Plan {
  const fields = fieldMap(service);
  const missing = new Map<string, FieldDef>();
  const missingDocs = new Set<string>();
  const steps: PlannedStep[] = [];

  for (const step of service.workflow.steps) {
    const entries: PlanEntry[] = [];
    const uploads: PlanUpload[] = [];
    const humanCheckpoints: PlannedStep["humanCheckpoints"] = [];
    const seen = new Set<string>();
    for (const a of step.actions) {
      if (a.do === "fill" || a.do === "select") {
        const def = fields.get(a.field);
        if (!def) continue;
        const value = confirmedValue(profile, a.field);
        if (value === null) {
          if (def.required) missing.set(def.key, def);
          continue;
        }
        if (seen.has(a.field)) continue;
        seen.add(a.field);
        entries.push({
          field: a.field,
          label: def.label,
          portalLabel: a.label,
          value: a.do === "fill" ? formatValue(def, value, a.format) : value,
          sensitive: def.sensitive,
          selector: a.selector,
          kind: a.do,
        });
      } else if (a.do === "upload") {
        const doc = service.requiredDocs.find((d) => d.kind === a.doc);
        if (!doc) continue;
        if (!availableDocs.has(a.doc)) missingDocs.add(a.doc);
        uploads.push({ doc: a.doc, label: doc.label, selector: a.selector });
      } else if (a.do === "human") {
        humanCheckpoints.push(a.kind);
      } else if (a.do === "approve") {
        humanCheckpoints.push("final_submit");
      }
    }
    steps.push({ id: step.id, title: step.title, phase: step.phase, entries, uploads, humanCheckpoints });
  }

  return {
    steps,
    missingFields: [...missing.values()],
    missingDocs: [...missingDocs],
    ready: missing.size === 0 && missingDocs.size === 0,
  };
}

/** Values the agent may type in a step, keyed by field, including safe format variants. */
export function allowedValuesForStep(
  service: ServiceDefinition,
  step: WorkflowStep,
  profile: Profile,
): Map<string, Set<string>> {
  const fields = fieldMap(service);
  const out = new Map<string, Set<string>>();
  for (const a of step.actions) {
    if (a.do !== "fill" && a.do !== "select") continue;
    const def = fields.get(a.field);
    const value = confirmedValue(profile, a.field);
    if (!def || value === null) continue;
    const set = out.get(a.field) ?? new Set<string>();
    for (const v of valueVariants(def, value)) set.add(v);
    if (a.do === "fill") set.add(formatValue(def, value, a.format));
    out.set(a.field, set);
  }
  return out;
}

export interface FieldSuggestion {
  field: string;
  value: string | null;
  confidence: Confidence | null;
  sourceDocumentId: string | null;
  /** Raw extracted value when it could not be normalised (shown to help the user). */
  rawValue: string | null;
}

/**
 * Turn per-document extractions into one suggestion per field, following each
 * field's source order. The user confirms or edits every suggestion.
 */
export function suggestProfile(
  service: ServiceDefinition,
  extractions: Array<{ documentId: string; kind: string; extraction: StoredExtraction }>,
  existing: Profile,
): FieldSuggestion[] {
  return fieldsUsedByService(service).map((field) => {
    const current = existing[field.key];
    for (const src of field.sources) {
      const [kind, key] = src.split(".") as [string, string];
      for (const ex of extractions) {
        if (ex.kind !== kind || ex.extraction.containsAadhaar) continue;
        const hit = ex.extraction.fields[key];
        if (!hit || hit.value == null) continue;
        const normalized = normalizeValue(field, hit.value);
        return {
          field: field.key,
          value: normalized,
          confidence: normalized === null ? "low" : hit.confidence,
          sourceDocumentId: ex.documentId,
          rawValue: normalized === null ? hit.value : null,
        };
      }
    }
    return {
      field: field.key,
      value: current?.value ?? null,
      confidence: null,
      sourceDocumentId: null,
      rawValue: null,
    };
  });
}

export function findStep(service: ServiceDefinition, id: string): WorkflowStep | undefined {
  return service.workflow.steps.find((s) => s.id === id);
}
