import type { FieldDef, FillFormat } from "./schemas";
import { INDIAN_STATES } from "./geo";

/**
 * Canonical value handling. Profiles store canonical forms (ISO dates, plain
 * numbers, 10-digit phones); the portal may want a different presentation.
 * Formatting is never inventing: every variant is derived from the confirmed value.
 */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function validYmd(y: number, m: number, d: number): boolean {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= days;
}

/** Parse common Indian date spellings into ISO yyyy-mm-dd, or null. */
export function normalizeDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validYmd(y, mo, d) ? `${y}-${pad2(mo)}-${pad2(d)}` : null;
  }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) {
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validYmd(y, mo, d) ? `${y}-${pad2(mo)}-${pad2(d)}` : null;
  }
  m = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/.exec(s);
  if (m) {
    const mo = MONTHS[m[2]!.slice(0, 4).toLowerCase()] ?? MONTHS[m[2]!.slice(0, 3).toLowerCase()];
    const [d, y] = [Number(m[1]), Number(m[3])];
    return mo && validYmd(y, mo, d) ? `${y}-${pad2(mo)}-${pad2(d)}` : null;
  }
  return null;
}

function fieldOptions(field: FieldDef): readonly string[] | undefined {
  if (field.options) return field.options;
  if (field.optionsRef === "indianStates") return INDIAN_STATES;
  return undefined;
}

/** Bring a raw (extracted or typed) value into canonical form. Returns null if it cannot be understood. */
export function normalizeValue(field: FieldDef, raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = raw.replace(/\s+/g, " ").trim();
  if (!s) return null;
  switch (field.type) {
    case "date":
      return normalizeDate(s);
    case "percentage": {
      const n = s.replace(/%|percent/gi, "").trim();
      return /^\d{1,3}(\.\d{1,3})?$/.test(n) && Number(n) <= 100 ? String(Number(n)) : null;
    }
    case "currency": {
      const n = s.replace(/₹|rs\.?|inr|\/-|,|\s/gi, "");
      return /^\d{1,12}$/.test(n) ? String(Number(n)) : null;
    }
    case "phone": {
      const digits = s.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
      return /^[6-9]\d{9}$/.test(digits) ? digits : null;
    }
    case "year":
      return /^(19|20)\d{2}$/.test(s) ? s : null;
    case "digits": {
      const digits = s.replace(/[\s-]/g, "");
      return /^\d+$/.test(digits) ? digits : null;
    }
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s.toLowerCase() : null;
    case "enum": {
      const options = fieldOptions(field) ?? [];
      return options.find((o) => o.toLowerCase() === s.toLowerCase()) ?? null;
    }
    case "text":
    default:
      return s.length <= 200 ? s : null;
  }
}

/** Validate a canonical value; returns an error code or null. */
export function checkValue(field: FieldDef, value: string): "invalid" | "pattern" | null {
  const normalized = normalizeValue(field, value);
  if (normalized === null) return "invalid";
  if (field.pattern && !new RegExp(field.pattern).test(normalized)) return "pattern";
  return null;
}

export function formatValue(field: FieldDef, value: string, format?: FillFormat): string {
  if (!format) return value;
  switch (format) {
    case "dd/mm/yyyy":
    case "dd-mm-yyyy": {
      const iso = normalizeDate(value);
      if (!iso) return value;
      const [y, m, d] = iso.split("-");
      const sep = format === "dd/mm/yyyy" ? "/" : "-";
      return `${d}${sep}${m}${sep}${y}`;
    }
    case "digits":
      return value.replace(/\D/g, "");
    case "upper":
      return value.toUpperCase();
    case "fixed2":
      return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : value;
  }
}

function indianGrouping(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${last3}`;
}

/** Names the model may use to ask for a presentation of a value without ever seeing the value. */
export const VARIANT_FORMATS = [
  "as_is",
  "yyyy-mm-dd",
  "dd/mm/yyyy",
  "dd-mm-yyyy",
  "dd.mm.yyyy",
  "ddmmyyyy",
  "fixed2",
  "fixed1",
  "integer",
  "digits",
  "indian_grouping",
  "western_grouping",
  "with_country_code",
  "with_country_code_space",
  "with_leading_zero",
  "upper",
  "lower",
] as const;
export type VariantFormat = (typeof VARIANT_FORMATS)[number];

export interface NamedVariant {
  format: VariantFormat;
  value: string;
}

/**
 * Every presentation of a confirmed value the agent may type, each with a
 * format name. The validator rejects any typed value that is not one of these.
 */
export function namedVariants(field: FieldDef, value: string): NamedVariant[] {
  const out: NamedVariant[] = [{ format: "as_is", value }];
  const add = (format: VariantFormat, v: string) => {
    if (!out.some((o) => o.format === format)) out.push({ format, value: v });
  };
  switch (field.type) {
    case "date": {
      const iso = normalizeDate(value);
      if (iso) {
        const [y, m, d] = iso.split("-");
        add("yyyy-mm-dd", iso);
        add("dd/mm/yyyy", `${d}/${m}/${y}`);
        add("dd-mm-yyyy", `${d}-${m}-${y}`);
        add("dd.mm.yyyy", `${d}.${m}.${y}`);
        add("ddmmyyyy", `${d}${m}${y}`);
      }
      break;
    }
    case "percentage": {
      const n = Number(value);
      if (Number.isFinite(n)) {
        add("fixed2", n.toFixed(2));
        add("fixed1", n.toFixed(1));
        if (Number.isInteger(n)) add("integer", String(Math.trunc(n)));
      }
      break;
    }
    case "currency": {
      const digits = value.replace(/\D/g, "");
      add("digits", digits);
      add("indian_grouping", indianGrouping(digits));
      add("western_grouping", digits.replace(/\B(?=(\d{3})+(?!\d))/g, ","));
      break;
    }
    case "phone":
      add("with_country_code", `+91${value}`);
      add("with_country_code_space", `+91 ${value}`);
      add("with_leading_zero", `0${value}`);
      break;
    case "text":
    case "enum":
      add("upper", value.toUpperCase());
      add("lower", value.toLowerCase());
      break;
    case "email":
      add("lower", value.toLowerCase());
      break;
    default:
      break;
  }
  return out;
}

export function valueVariants(field: FieldDef, value: string): string[] {
  return [...new Set(namedVariants(field, value).map((v) => v.value))];
}

/** Describe the shape of a variant without revealing the value (for model prompts). */
export function describeVariant(field: FieldDef, v: NamedVariant): string {
  if (field.sensitive) {
    return v.value.replace(/[A-Za-z]/g, "A").replace(/\d/g, "9");
  }
  return v.value;
}
