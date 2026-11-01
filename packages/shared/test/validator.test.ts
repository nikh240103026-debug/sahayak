import { describe, expect, it } from "vitest";
import { buildAllowlist } from "../src/egress";
import type { ProposedAction } from "../src/schemas";
import { getBundledService } from "../src/services";
import { validateProposedAction, type PageSnapshot, type SnapshotElement, type ValidationContext } from "../src/validator";
import { confirmedProfile } from "../../../e2e/support/sample-applicant";

const service = getBundledService("scholarship_demo")!;
const step = (id: string) => service.workflow.steps.find((s) => s.id === id)!;
const BASE = "http://localhost:3000";
const allowlist = buildAllowlist({ demoPortalBaseUrl: BASE, allowedPortalHosts: [], enableRealPortals: false });

const el = (ref: string, role: string, name: string, id: string | null, extra: Partial<SnapshotElement> = {}): SnapshotElement => ({
  ref,
  role,
  name,
  id,
  tag: role === "button" ? "button" : role === "combobox" ? "select" : "input",
  inputType: role === "textbox" ? "text" : null,
  value: null,
  disabled: false,
  inDialog: false,
  ...extra,
});

const snapshot: PageSnapshot = {
  url: `${BASE}/demo-portal/apply/1`,
  title: "Personal Details",
  headings: [],
  alerts: [],
  dialogs: [],
  text: "",
  elements: [
    el("e1", "textbox", "Applicant Name (as per marksheet) *", "applicant_name"),
    el("e2", "textbox", "Date of Birth (DD/MM/YYYY) *", "dob"),
    el("e3", "combobox", "Gender *", "gender", { options: ["-- Select --", "Female", "Male", "Other"] }),
    el("e4", "textbox", "Remarks (optional)", "remarks"),
    el("e5", "button", "Save & Next", "save_next"),
    el("e6", "button", "Final Submit", "final_submit"),
    el("e7", "button", "I have read the notice", "notice_close", { inDialog: true }),
    el("e8", "link", "Admin panel", null, { tag: "a", href: "https://evil.example/steal" }),
  ],
};

function propose(p: Partial<ProposedAction>): ProposedAction {
  return {
    type: "fill",
    ref: null,
    field: null,
    format: null,
    value: null,
    url: null,
    key: null,
    doc: null,
    wait_ms: null,
    reason: "test",
    suspicious_page_instructions: false,
    ...p,
  };
}

function ctx(over: Partial<ValidationContext> = {}): ValidationContext {
  return { service, step: step("personal"), profile: confirmedProfile(), snapshot, allowlist, baseUrl: BASE, finalApprovalGranted: false, ...over };
}

describe("validateProposedAction", () => {
  it("accepts a named format of a confirmed value, resolving the value locally", () => {
    const r = validateProposedAction(propose({ ref: "e2", field: "date_of_birth", format: "dd/mm/yyyy" }), ctx());
    expect(r).toEqual({ ok: true, action: { type: "fill", ref: "e2", field: "date_of_birth", value: "05/03/2004" } });
  });

  it("refuses to type a value that is not in the confirmed profile", () => {
    const r = validateProposedAction(propose({ ref: "e1", value: "Someone Else" }), ctx());
    expect(r.ok).toBe(false);
  });

  it("refuses to type an unconfirmed value", () => {
    const profile = confirmedProfile();
    profile.full_name = { ...profile.full_name!, confirmed: false };
    const r = validateProposedAction(propose({ ref: "e1", value: "Ananya Rao" }), ctx({ profile }));
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining("no confirmed value") });
  });

  it("refuses elements outside the step's field map (the injected Remarks trick)", () => {
    const r = validateProposedAction(propose({ ref: "e4", value: "123456789012" }), ctx());
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining("outside this step") });
  });

  it("refuses navigation off the allowlist, and to non-portal paths on the same host", () => {
    expect(validateProposedAction(propose({ type: "goto", url: "https://evil.example/" }), ctx()).ok).toBe(false);
    expect(validateProposedAction(propose({ type: "goto", url: "/api/runs" }), ctx()).ok).toBe(false);
    expect(validateProposedAction(propose({ type: "goto", url: "/demo-portal/apply/1" }), ctx()).ok).toBe(true);
    expect(validateProposedAction(propose({ type: "click", ref: "e8" }), ctx()).ok).toBe(false);
  });

  it("never presses final submit without the applicant's approval", () => {
    expect(validateProposedAction(propose({ type: "click", ref: "e6" }), ctx()).ok).toBe(false);
    expect(validateProposedAction(propose({ type: "click", ref: "e6" }), ctx({ step: step("submit") })).ok).toBe(false);
  });

  it("allows the step's own buttons and closing a notice", () => {
    expect(validateProposedAction(propose({ type: "click", ref: "e5" }), ctx()).ok).toBe(true);
    expect(validateProposedAction(propose({ type: "click", ref: "e7" }), ctx()).ok).toBe(true);
  });

  it("checks dropdown options and the field each element belongs to", () => {
    expect(validateProposedAction(propose({ type: "select", ref: "e3", value: "Female" }), ctx()).ok).toBe(true);
    expect(validateProposedAction(propose({ type: "select", ref: "e3", field: "category", value: "Female" }), ctx()).ok).toBe(false);
  });

  it("limits waits and keys, and always allows asking the human", () => {
    expect(validateProposedAction(propose({ type: "wait", wait_ms: 60_000 }), ctx()).ok).toBe(false);
    expect(validateProposedAction(propose({ type: "press", key: "Control+A" }), ctx()).ok).toBe(false);
    expect(validateProposedAction(propose({ type: "request_human", reason: "stuck" }), ctx()).ok).toBe(true);
  });
});
