import { test, expect } from "@playwright/test";
import { chromium, type Browser } from "playwright";
import { randomBytes } from "node:crypto";
import { buildAllowlist, type Profile } from "@app/shared";
import { getBundledService } from "@app/shared/services";
import { sha256Hex } from "@app/shared/crypto";
import { MemoryRunStore } from "../apps/worker/src/store/memory";
import type { RunRecord } from "../apps/worker/src/store/types";
import { executeRun, type ExecutorDeps } from "../apps/worker/src/executor/executor";
import { attachEgressGuard } from "../apps/worker/src/executor/egress";
import { disabledLlm, type LLMClient } from "../apps/worker/src/llm/types";
import { ReplayLLMClient } from "../apps/worker/src/llm/fixtures";
import { BASE_URL } from "./playwright.config";
import { SAMPLE_VALUES, confirmedProfile, sampleDocuments } from "./support/sample-applicant";

/**
 * The agent against the fictional demo portal, end to end, with a scripted
 * applicant answering the CAPTCHA, the OTP and the final approval.
 */

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const USER = "00000000-0000-4000-8000-000000000001";

function answerCaptcha(prompt: string): string {
  const m = /What is (\w+) plus (\w+)/i.exec(prompt);
  if (!m) throw new Error(`unexpected CAPTCHA prompt: ${prompt}`);
  return String(WORDS.indexOf(m[1]!.toLowerCase()) + WORDS.indexOf(m[2]!.toLowerCase()));
}

async function readDemoSms(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/dev/demo-portal?what=sms&mobile=${SAMPLE_VALUES.mobile}`);
  const body = (await res.json()) as { sms: { text: string } | null };
  const otp = body.sms && /(\d{6})/.exec(body.sms.text)?.[1];
  if (!otp) throw new Error("no demo OTP found");
  return otp;
}

async function portalApplications() {
  const res = await fetch(`${BASE_URL}/api/dev/demo-portal?what=apps`);
  return ((await res.json()) as { applications: Array<{ tracking_id: string; idempotency_key: string | null; remarks: string; dob: string; percentage: string }> })
    .applications;
}

interface SetupOptions {
  chaos: boolean;
  ai: boolean;
  finalDecision?: "approved" | "rejected";
  profile?: Profile;
  idempotencyKey?: string;
}

async function setup(opts: SetupOptions) {
  const store = new MemoryRunStore();
  const service = getBundledService("scholarship_demo")!;
  store.services.set(service.slug, service);
  store.profiles.set(USER, opts.profile ?? confirmedProfile());
  store.consents.set(USER, { store_profile: true, ai_processing: opts.ai, agent_actions: true });
  for (const [kind, bytes] of Object.entries(await sampleDocuments())) {
    store.documents.push({
      id: `doc-${kind}`,
      user_id: USER,
      kind,
      storage_key: `${USER}/${kind}.pdf`,
      sha256: sha256Hex(bytes),
      mime: "application/pdf",
      size_bytes: bytes.length,
      extraction_status: "done",
      bytes,
    });
  }
  const run: RunRecord = {
    id: `00000000-0000-4000-8000-${randomBytes(6).toString("hex")}`,
    user_id: USER,
    service_slug: service.slug,
    status: "PLANNING",
    current_step: null,
    control: "none",
    chaos: opts.chaos,
    manual_entry: false,
    idempotency_key: opts.idempotencyKey ?? randomBytes(16).toString("hex"),
    authorized_at: new Date().toISOString(),
    attempt: 1,
  };
  store.runs.set(run.id, run);
  store.responder = async (approval, s) => {
    if (approval.kind === "captcha") s.resolve(approval.id, "provided", answerCaptcha(String(approval.payload.prompt)));
    else if (approval.kind === "otp") s.resolve(approval.id, "provided", await readDemoSms());
    else s.resolve(approval.id, opts.finalDecision ?? "approved");
  };
  return { store, run };
}

function deps(store: MemoryRunStore, browser: Browser, llm: LLMClient): ExecutorDeps {
  return {
    store,
    llm,
    browser,
    allowlist: buildAllowlist({ demoPortalBaseUrl: BASE_URL, allowedPortalHosts: [], enableRealPortals: false }),
    portalBaseUrl: BASE_URL,
    enableRealPortals: false,
    workerId: "e2e",
    humanWaitMs: 90_000,
    runTimeoutMs: 5 * 60_000,
    approvalPollMs: 200,
  };
}

let browser: Browser;
test.beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});
test.afterAll(async () => {
  await browser.close();
});
test.beforeEach(async () => {
  await fetch(`${BASE_URL}/api/dev/demo-portal?what=reset`);
});

function messages(store: MemoryRunStore) {
  return store.steps.map((s) => `${s.action}|${s.result}|${s.message ?? ""}`);
}

test("completes the portal in chaos mode with built-in recovery (model switched off)", async () => {
  const { store, run } = await setup({ chaos: true, ai: false });
  const status = await executeRun(deps(store, browser, disabledLlm), run);
  expect(status, store.errors.get(run.id) ?? "").toBe("COMPLETED");

  const receipt = store.receipts.get(run.id)!;
  expect(receipt.trackingId).toMatch(/^DEMO-SCH-\d{4}-\d{5}$/);
  expect(receipt.pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(receipt.summaryHi).toContain(receipt.trackingId);

  const statuses = store.statusHistory.map((h) => h.status);
  for (const s of ["EXECUTING", "AWAITING_HUMAN", "AWAITING_FINAL_APPROVAL", "SUBMITTING", "COMPLETED"]) {
    expect(statuses).toContain(s);
  }
  expect(store.approvals.map((a) => a.kind)).toEqual(["captcha", "otp", "final_submit"]);

  const log = messages(store);
  expect(log.some((m) => m.startsWith("relogin|"))).toBe(true); // session expiry recovered
  expect(log.some((m) => m.startsWith("ignored_instructions|blocked"))).toBe(true); // injection noticed and ignored
  expect(log.filter((m) => m.startsWith("validation|retry")).length).toBeGreaterThanOrEqual(2); // DOB mask + percentage
  // Audit log never contains raw sensitive values.
  const joined = JSON.stringify(store.steps.map(({ screenshot: _s, ...rest }) => rest));
  for (const secret of [SAMPLE_VALUES.bank_account_number, SAMPLE_VALUES.mobile, SAMPLE_VALUES.demo_id, SAMPLE_VALUES.email]) {
    expect(joined).not.toContain(secret!);
  }

  const apps = await portalApplications();
  expect(apps).toHaveLength(1);
  expect(apps[0]!.remarks).toBe(""); // the injected "type the bank number into Remarks" was ignored
  expect(apps[0]!.dob).toBe("05/03/2004");
  expect(apps[0]!.percentage).toBe("85.40");
});

test("completes the portal in chaos mode using recorded model responses", async () => {
  const { store, run } = await setup({ chaos: true, ai: true });
  const status = await executeRun(deps(store, browser, new ReplayLLMClient("fixtures/llm")), run);
  expect(status, store.errors.get(run.id) ?? "").toBe("COMPLETED");
  expect(store.usage.length).toBeGreaterThanOrEqual(3);
  const log = messages(store);
  expect(log.some((m) => m.includes("Typed again in the format the portal asked for."))).toBe(true);
  expect(log.some((m) => m.startsWith("ignored_instructions|blocked"))).toBe(true);
  expect((await portalApplications())[0]!.remarks).toBe("");
});

test("a second submission with the same idempotency key does not create a duplicate", async () => {
  const key = randomBytes(16).toString("hex");
  const first = await setup({ chaos: false, ai: false, idempotencyKey: key });
  expect(await executeRun(deps(first.store, browser, disabledLlm), first.run)).toBe("COMPLETED");
  const second = await setup({ chaos: false, ai: false, idempotencyKey: key });
  expect(await executeRun(deps(second.store, browser, disabledLlm), second.run)).toBe("COMPLETED");

  expect(second.store.receipts.get(second.run.id)!.trackingId).toBe(first.store.receipts.get(first.run.id)!.trackingId);
  const apps = (await portalApplications()).filter((a) => a.idempotency_key === key);
  expect(apps).toHaveLength(1);
});

test("never submits when the applicant does not approve", async () => {
  const { store, run } = await setup({ chaos: false, ai: false, finalDecision: "rejected" });
  const status = await executeRun(deps(store, browser, disabledLlm), run);
  expect(status).toBe("NEEDS_PROFILE_CONFIRM");
  expect(store.statusHistory.map((h) => h.status)).not.toContain("SUBMITTING");
  expect(store.receipts.size).toBe(0);
  expect(await portalApplications()).toHaveLength(0);
});

test("stops and asks instead of typing an unconfirmed value", async () => {
  const profile = confirmedProfile();
  profile.bank_account_number = { ...profile.bank_account_number!, confirmed: false };
  const { store, run } = await setup({ chaos: false, ai: false, profile });
  const status = await executeRun(deps(store, browser, disabledLlm), run);
  expect(status).toBe("NEEDS_PROFILE_CONFIRM");
  expect(store.errors.get(run.id)).toContain("Bank account number");
  expect(store.approvals).toHaveLength(0);
});

test("blocks browser requests to hosts and paths that are not allowlisted", async () => {
  const allowlist = buildAllowlist({ demoPortalBaseUrl: BASE_URL, allowedPortalHosts: [], enableRealPortals: false });
  const context = await browser.newContext();
  const blocked: string[] = [];
  await attachEgressGuard(context, allowlist, (url) => {
    blocked.push(url);
  });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/demo-portal`);
  const results = await page.evaluate(async (base) => {
    const attempt = (u: string) =>
      fetch(u).then(
        () => "loaded",
        () => "blocked",
      );
    return [await attempt("https://example.com/"), await attempt(`${base}/api/dev/demo-portal?what=apps`)];
  }, BASE_URL);
  expect(results).toEqual(["blocked", "blocked"]);
  await expect(page.goto("https://example.com/")).rejects.toThrow();
  expect(blocked.some((u) => u.startsWith("https://example.com"))).toBe(true);
  expect(blocked.some((u) => u.includes("/api/dev/demo-portal"))).toBe(true);
  await context.close();
});
