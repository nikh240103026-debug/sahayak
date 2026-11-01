import type { EligibilityRule, Localized, Profile, RequiredDoc, ServiceDefinition } from "./schemas";
import { confirmedValue } from "./workflow";
import { normalizeDate } from "./values";

/** Deterministic eligibility. No model is involved anywhere in this file. */

export type RuleStatus = "pass" | "fail" | "unknown";

export interface RuleResult {
  id: string;
  label: Localized;
  status: RuleStatus;
  field: string;
}

export interface EligibilityResult {
  overall: "eligible" | "not_eligible" | "incomplete";
  rules: RuleResult[];
  missingDocs: RequiredDoc[];
}

/** Whole years between an ISO birth date and `today` (UTC calendar). */
export function ageOn(dobIso: string, today: Date): number | null {
  const iso = normalizeDate(dobIso);
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const ty = today.getUTCFullYear();
  const tm = today.getUTCMonth() + 1;
  const td = today.getUTCDate();
  let age = ty - y;
  if (tm < m || (tm === m && td < d)) age -= 1;
  return age;
}

export function isAdult(dobIso: string, today: Date = new Date()): boolean {
  const age = ageOn(dobIso, today);
  return age !== null && age >= 18;
}

function asNumber(v: string): number | null {
  const n = Number(v.replace(/[,\s₹%]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function evaluateRule(rule: EligibilityRule, value: string | null, today: Date): RuleStatus {
  if (value === null) return "unknown";
  const target = rule.value;
  switch (rule.op) {
    case "gte":
    case "lte": {
      const n = asNumber(value);
      if (n === null || typeof target !== "number") return "unknown";
      return (rule.op === "gte" ? n >= target : n <= target) ? "pass" : "fail";
    }
    case "eq":
      return String(target).toLowerCase() === value.toLowerCase() ? "pass" : "fail";
    case "in":
      return Array.isArray(target) && target.map((t) => String(t).toLowerCase()).includes(value.toLowerCase())
        ? "pass"
        : "fail";
    case "between": {
      const n = asNumber(value);
      if (n === null || !Array.isArray(target)) return "unknown";
      const [lo, hi] = target.map(Number) as [number, number];
      return n >= lo && n <= hi ? "pass" : "fail";
    }
    case "ageBetween": {
      const age = ageOn(value, today);
      if (age === null || !Array.isArray(target)) return "unknown";
      const [lo, hi] = target.map(Number) as [number, number];
      return age >= lo && age <= hi ? "pass" : "fail";
    }
  }
}

/**
 * Evaluate a service's rules against confirmed profile values. Unconfirmed or
 * missing values give "unknown", never a guess.
 */
export function evaluateEligibility(
  service: ServiceDefinition,
  profile: Profile,
  uploadedDocKinds: ReadonlySet<string>,
  today: Date = new Date(),
): EligibilityResult {
  const rules = service.eligibility.rules.map<RuleResult>((rule) => ({
    id: rule.id,
    label: rule.label,
    field: rule.field,
    status: evaluateRule(rule, confirmedValue(profile, rule.field), today),
  }));
  const missingDocs = service.requiredDocs.filter((d) => !uploadedDocKinds.has(d.kind));
  const overall = rules.some((r) => r.status === "fail")
    ? "not_eligible"
    : rules.some((r) => r.status === "unknown") || missingDocs.length > 0
      ? "incomplete"
      : "eligible";
  return { overall, rules, missingDocs };
}
