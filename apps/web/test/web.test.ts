import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import en from "../messages/en.json" with { type: "json" };
import hi from "../messages/hi.json" with { type: "json" };
import { legal } from "../content/legal";
import { validateStep } from "../lib/demo-portal/forms";

/* --------------------------- WCAG 2.2 AA contrast --------------------------- */

function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!.toLowerCase()]));
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hiL, loL] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hiL + 0.05) / (loL + 0.05);
}

const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");
const light = tokens(/:root\s*\{([\s\S]*?)\}/.exec(css)![1]!);
const dark = tokens(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\}/.exec(css)![1]!);

describe.each([
  ["light", light],
  ["dark", dark],
])("%s theme colour contrast", (_name, t) => {
  const text: Array<[string, string]> = [
    ["ink", "paper"],
    ["ink", "surface"],
    ["muted", "paper"],
    ["muted", "surface"],
    ["primary", "paper"],
    ["primary", "surface"],
    ["on-primary", "primary"],
    ["on-accent", "accent"],
    ["danger", "paper"],
    ["danger", "surface"],
    ["success", "paper"],
    ["stamp", "paper"],
    ["stamp", "surface"],
  ];
  it.each(text)("%s on %s is at least 4.5:1", (fg, bg) => {
    expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(["paper", "surface"])("the focus indicator (marigold ring + ink edge) reaches 3:1 on %s", (bg) => {
    // WCAG 1.4.11: some part of the indicator must contrast 3:1 with the background.
    expect(Math.max(contrast(t.accent!, t[bg]!), contrast(t.ink!, t[bg]!))).toBeGreaterThanOrEqual(3);
  });
});

describe("dark theme for system preference matches the explicit dark theme", () => {
  it("defines the same tokens", () => {
    const system = tokens(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\[data-theme="system"\]\s*\{([\s\S]*?)\}/.exec(css)![1]!);
    expect(system).toEqual(dark);
  });
});

/* ------------------------------- translations ------------------------------- */

function paths(o: unknown, prefix = ""): string[] {
  return o && typeof o === "object"
    ? Object.entries(o).flatMap(([k, v]) => paths(v, prefix ? `${prefix}.${k}` : k))
    : [prefix];
}

describe("English and Hindi", () => {
  it("have the same message keys and placeholders", () => {
    expect(paths(hi).sort()).toEqual(paths(en).sort());
    const placeholders = (s: string) => (s.match(/\{[a-z]+\}/gi) ?? []).sort();
    const get = (o: unknown, p: string): string =>
      String(p.split(".").reduce<unknown>((a, k) => (a as Record<string, unknown> | undefined)?.[k], o) ?? "");
    for (const p of paths(en)) expect(placeholders(get(hi, p)), p).toEqual(placeholders(get(en, p)));
  });
  it("legal pages have matching sections in both languages", () => {
    for (const doc of Object.values(legal)) {
      expect(doc.hi.sections.length).toBe(doc.en.sections.length);
      expect(doc.en.sections.length).toBeGreaterThan(0);
    }
  });
  it("copy avoids technical jargon in the interface", () => {
    expect(JSON.stringify(en)).not.toMatch(/\b(LLM|tokens?|orchestration|prompt)\b/i);
  });
});

/* ------------------------------ demo portal rules ------------------------------ */

describe("demo portal validation", () => {
  const personal = { applicant_name: "Ananya Rao", father_name: "Suresh Rao", dob: "2004-03-05", gender: "Female", category: "OBC", mobile: "9876543210", email: "a@example.com", remarks: "" };
  it("accepts several date spellings normally but only DD/MM/YYYY in chaos mode", () => {
    expect(validateStep(1, personal, []).errors).toEqual([]);
    expect(validateStep(1, personal, ["validation"]).errors[0]).toMatch(/^Date of Birth:/);
    expect(validateStep(1, { ...personal, dob: "05/03/2004" }, ["validation"]).errors).toEqual([]);
  });
  it("needs exactly two decimals for the percentage in chaos mode", () => {
    const academic = { previous_exam: "HSC", board: "Board", passing_year: "2024", percentage: "85.4", annual_income: "185000", income_cert_no: "INC-1" };
    expect(validateStep(3, academic, []).errors).toEqual([]);
    expect(validateStep(3, academic, ["validation"]).errors[0]).toMatch(/^Percentage of Marks:/);
    expect(validateStep(3, { ...academic, percentage: "85.40" }, ["validation"]).errors).toEqual([]);
  });
  it("checks dependent dropdown choices against the state and district", () => {
    const r = validateStep(2, { state: "Maharashtra", district: "Pune", institution: "Gomti Degree College (Demo)", course: "BSc", year_of_study: "2" }, []);
    expect(r.errors[0]).toMatch(/^Institution:/);
  });
});
