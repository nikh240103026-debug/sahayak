/**
 * Redaction helpers. Everything written to run_steps, approvals.payload_redacted
 * and application logs passes through here first.
 */

/** Mask all but the last `keep` characters: "9876543210" -> "XXXXXX3210". */
export function maskValue(value: string, keep = 4): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "";
  if (trimmed.length <= keep) return "X".repeat(Math.max(4, trimmed.length));
  return "X".repeat(trimmed.length - keep) + trimmed.slice(-keep);
}

/* ---------------- Aadhaar detection (Verhoeff checksum) ---------------- */

const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function verhoeffValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let c = 0;
  const reversed = digits.split("").reverse();
  for (let i = 0; i < reversed.length; i++) {
    const p = VERHOEFF_P[i % 8]![Number(reversed[i])]!;
    c = VERHOEFF_D[c]![p]!;
  }
  return c === 0;
}

/** Aadhaar numbers are 12 digits, never start with 0 or 1, and pass Verhoeff. */
export function isLikelyAadhaar(raw: string): boolean {
  const digits = raw.replace(/[\s-]/g, "");
  return /^[2-9]\d{11}$/.test(digits) && verhoeffValid(digits);
}

const AADHAAR_CANDIDATE = /(?<!\d)([2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4})(?!\d)/g;

export function findAadhaarNumbers(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(AADHAAR_CANDIDATE)) {
    if (m[1] && isLikelyAadhaar(m[1])) found.push(m[1]);
  }
  return found;
}

export function containsAadhaar(text: string): boolean {
  return findAadhaarNumbers(text).length > 0;
}

/** Replace Aadhaar-like numbers with "XXXX XXXX 1234". */
export function maskAadhaar(text: string): string {
  return text.replace(AADHAAR_CANDIDATE, (match) => {
    if (!isLikelyAadhaar(match)) return match;
    const digits = match.replace(/[\s-]/g, "");
    return `XXXX XXXX ${digits.slice(-4)}`;
  });
}

/* ---------------- Free-text redaction for logs ---------------- */

const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const LONG_DIGITS = /(?<![\w-])(\+?\d[\d\s-]{7,}\d)(?![\w-])/g;
const PAN = /\b[A-Z]{5}\d{4}[A-Z]\b/g;
const DEMO_ID = /\bDEMO-\d{4}-(\d{4})\b/g;

/**
 * Best-effort redaction of PII patterns inside free text (error messages,
 * model reasons, page text excerpts). Field values are masked separately with maskValue().
 */
export function redactText(text: string): string {
  return maskAadhaar(text)
    .replace(EMAIL, (_m, first: string, domain: string) => `${first}***@${domain}`)
    .replace(DEMO_ID, (_m, last4: string) => `DEMO-XXXX-${last4}`)
    .replace(PAN, (m) => maskValue(m))
    .replace(LONG_DIGITS, (m) => {
      const digits = m.replace(/\D/g, "");
      return digits.length >= 8 ? maskValue(digits) : m;
    });
}

/** Redact every string value whose key looks sensitive; recurse into objects/arrays. */
export function redactObject(input: unknown, sensitiveKeys: ReadonlySet<string> = DEFAULT_SENSITIVE_KEYS): unknown {
  if (typeof input === "string") return redactText(input);
  if (Array.isArray(input)) return input.map((v) => redactObject(v, sensitiveKeys));
  if (input && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      if (sensitiveKeys.has(k.toLowerCase()) && (typeof v === "string" || typeof v === "number")) {
        out[k] = maskValue(String(v));
      } else {
        out[k] = redactObject(v, sensitiveKeys);
      }
    }
    return out;
  }
  return input;
}

export const DEFAULT_SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  "password",
  "otp",
  "captcha",
  "token",
  "secret",
  "authorization",
  "cookie",
  "value",
  "email",
  "mobile",
  "phone",
  "date_of_birth",
  "dob",
  "demo_id",
  "bank_account_number",
  "account_number",
  "annual_family_income",
  "income_certificate_number",
]);

/** The redacted form of a field value for the audit log. */
export function redactFieldValue(value: string, sensitive: boolean): string {
  if (!value) return "";
  if (sensitive) return maskValue(value);
  // Non-sensitive values still get pattern redaction and a length cap.
  const cleaned = redactText(value);
  return cleaned.length > 60 ? `${cleaned.slice(0, 57)}...` : cleaned;
}
