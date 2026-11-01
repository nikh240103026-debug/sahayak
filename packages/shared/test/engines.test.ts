import { describe, expect, it } from "vitest";
import { ageOn, evaluateEligibility, isAdult } from "../src/eligibility";
import { buildAllowlist, isUrlAllowed } from "../src/egress";
import { WorkerEnv, parseEnv } from "../src/env";
import { ServiceDefinition, canTransition } from "../src/schemas";
import { getBundledService } from "../src/services";
import { formatValue, namedVariants, normalizeValue } from "../src/values";
import { buildPlan, fieldsUsedByService, suggestProfile } from "../src/workflow";
import { confirmedProfile } from "../../../e2e/support/sample-applicant";

const service = getBundledService("scholarship_demo")!;
const field = (k: string) => service.fields.find((f) => f.key === k)!;
const allDocs = new Set(service.requiredDocs.map((d) => d.kind));
const TODAY = new Date("2026-11-01T00:00:00Z");

describe("eligibility (deterministic)", () => {
  it("passes the sample applicant", () => {
    expect(evaluateEligibility(service, confirmedProfile(), allDocs, TODAY).overall).toBe("eligible");
  });
  it("explains a failing rule and never guesses missing values", () => {
    const p = confirmedProfile();
    p.annual_family_income = { ...p.annual_family_income!, value: "400000" };
    delete p.previous_percentage;
    const r = evaluateEligibility(service, p, allDocs, TODAY);
    expect(r.overall).toBe("not_eligible");
    expect(r.rules.find((x) => x.id === "income")?.status).toBe("fail");
    expect(r.rules.find((x) => x.id === "marks")?.status).toBe("unknown");
  });
  it("treats unconfirmed values as unknown and lists missing documents", () => {
    const p = confirmedProfile();
    p.state = { ...p.state!, confirmed: false };
    const r = evaluateEligibility(service, p, new Set(["marksheet"]), TODAY);
    expect(r.rules.find((x) => x.id === "domicile")?.status).toBe("unknown");
    expect(r.missingDocs.map((d) => d.kind)).toEqual(["income_certificate", "id_proof"]);
    expect(r.overall).toBe("incomplete");
  });
  it("computes age on the birthday boundary", () => {
    expect(ageOn("2008-11-01", TODAY)).toBe(18);
    expect(ageOn("2008-11-02", TODAY)).toBe(17);
    expect(isAdult("2008-11-02", TODAY)).toBe(false);
  });
});

describe("values and formats", () => {
  it("normalises common spellings into canonical values", () => {
    expect(normalizeValue(field("date_of_birth"), "05/03/2004")).toBe("2004-03-05");
    expect(normalizeValue(field("date_of_birth"), "5 March 2004")).toBe("2004-03-05");
    expect(normalizeValue(field("date_of_birth"), "31/02/2004")).toBeNull();
    expect(normalizeValue(field("annual_family_income"), "Rs. 1,85,000/-")).toBe("185000");
    expect(normalizeValue(field("previous_percentage"), "85.4%")).toBe("85.4");
    expect(normalizeValue(field("mobile"), "+91 98765 43210")).toBe("9876543210");
    expect(normalizeValue(field("gender"), "female")).toBe("Female");
    expect(normalizeValue(field("state"), "maharashtra")).toBe("Maharashtra");
  });
  it("formats and lists only presentations of the same value", () => {
    expect(formatValue(field("date_of_birth"), "2004-03-05", "dd/mm/yyyy")).toBe("05/03/2004");
    expect(formatValue(field("bank_ifsc"), "demo0001234", "upper")).toBe("DEMO0001234");
    const v = namedVariants(field("previous_percentage"), "85.4").map((x) => x.value);
    expect(v).toEqual(expect.arrayContaining(["85.4", "85.40"]));
    expect(namedVariants(field("annual_family_income"), "185000").map((x) => x.value)).toContain("1,85,000");
  });
});

describe("workflow plan", () => {
  it("is ready for a confirmed profile and lists every human checkpoint", () => {
    const plan = buildPlan(service, confirmedProfile(), allDocs);
    expect(plan.ready).toBe(true);
    expect(plan.steps.flatMap((s) => s.humanCheckpoints)).toEqual(["captcha", "otp", "final_submit"]);
  });
  it("reports unconfirmed required values as missing instead of using them", () => {
    const p = confirmedProfile();
    p.bank_ifsc = { ...p.bank_ifsc!, confirmed: false };
    const plan = buildPlan(service, p, allDocs);
    expect(plan.ready).toBe(false);
    expect(plan.missingFields.map((f) => f.key)).toEqual(["bank_ifsc"]);
  });
  it("collects only the fields the service needs (purpose limitation)", () => {
    const keys = fieldsUsedByService(service).map((f) => f.key);
    expect(keys).toContain("bank_account_number");
    expect(keys).not.toContain("aadhaar");
  });
  it("suggests values in source order and ignores Aadhaar-flagged extractions", () => {
    const extraction = (fields: Record<string, string>, containsAadhaar = false) => ({
      method: "ai" as const,
      model: "m",
      extractedAt: "",
      documentKindMatches: true,
      containsAadhaar,
      fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v, confidence: "high" as const }])),
    });
    const s = suggestProfile(
      service,
      [
        { documentId: "d1", kind: "id_proof", extraction: extraction({ full_name: "From ID" }) },
        { documentId: "d2", kind: "marksheet", extraction: extraction({ student_name: "From Marksheet", percentage: "85.4%" }) },
        { documentId: "d3", kind: "income_certificate", extraction: extraction({ annual_income: "1,85,000" }, true) },
      ],
      {},
    );
    expect(s.find((x) => x.field === "full_name")?.value).toBe("From Marksheet");
    expect(s.find((x) => x.field === "previous_percentage")?.value).toBe("85.4");
    expect(s.find((x) => x.field === "annual_family_income")?.value).toBeNull();
  });
});

describe("egress allowlist", () => {
  const allow = buildAllowlist({ demoPortalBaseUrl: "https://app.example.in", allowedPortalHosts: ["portal.gov.example"], enableRealPortals: false });
  it("allows only the demo portal paths on the web host", () => {
    expect(isUrlAllowed("https://app.example.in/demo-portal/login", allow)).toBe(true);
    expect(isUrlAllowed("https://app.example.in/_next/static/chunk.js", allow)).toBe(true);
    expect(isUrlAllowed("https://app.example.in/api/runs/x/demo-sms", allow)).toBe(false);
    expect(isUrlAllowed("https://app.example.in/demo-portalx", allow)).toBe(false);
    expect(isUrlAllowed("https://app.example.in/app/settings", allow)).toBe(false);
  });
  it("keeps real portals off unless enabled, and refuses plain http and credentials", () => {
    expect(isUrlAllowed("https://portal.gov.example/", allow)).toBe(false);
    const on = buildAllowlist({ demoPortalBaseUrl: "https://app.example.in", allowedPortalHosts: ["portal.gov.example"], enableRealPortals: true });
    expect(isUrlAllowed("https://portal.gov.example/x", on)).toBe(true);
    expect(isUrlAllowed("http://app.example.in/demo-portal", allow)).toBe(false);
    const docker = buildAllowlist({ demoPortalBaseUrl: "http://host.docker.internal:3000", allowedPortalHosts: [], enableRealPortals: false });
    expect(isUrlAllowed("http://host.docker.internal:3000/demo-portal/login", docker)).toBe(true);
    expect(isUrlAllowed("https://u:p@app.example.in/demo-portal", allow)).toBe(false);
  });
});

describe("schemas", () => {
  it("enforces the run state machine", () => {
    expect(canTransition("PLANNING", "EXECUTING")).toBe(true);
    expect(canTransition("EXECUTING", "SUBMITTING")).toBe(false);
    expect(canTransition("AWAITING_FINAL_APPROVAL", "SUBMITTING")).toBe(true);
    expect(canTransition("COMPLETED", "FAILED")).toBe(false);
    expect(canTransition("AWAITING_HUMAN", "PAUSED_EXPIRED")).toBe(true);
  });
  it("refuses a real portal without a recorded terms review", () => {
    const raw = JSON.parse(JSON.stringify(service));
    raw.portalKind = "real";
    expect(ServiceDefinition.safeParse(raw).success).toBe(false);
  });
  it("requires an API key unless the model is switched off", () => {
    const base = {
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "k".repeat(30),
      ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
      WORKER_SHARED_SECRET: "s".repeat(40),
      DEMO_PORTAL_BASE_URL: "http://localhost:3000",
      ANTHROPIC_API_KEY: "",
    };
    expect(() => parseEnv(WorkerEnv, base)).toThrow(/ANTHROPIC_API_KEY/);
    expect(parseEnv(WorkerEnv, { ...base, LLM_DISABLED: "true" }).LLM_DISABLED).toBe(true);
  });
});
