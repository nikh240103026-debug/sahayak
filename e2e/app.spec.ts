import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SAMPLE_VALUES, sampleDocuments } from "./support/sample-applicant";

/**
 * Full stack: sign-up -> onboarding (under-18 blocked) -> upload synthetic documents ->
 * confirm details -> eligibility -> the worker completes the demo portal with ?chaos=1 ->
 * CAPTCHA, OTP and final approval in the UI -> receipt. Also RLS isolation between two users.
 *
 * Needs: E2E_FULL_STACK=1, a Supabase project with supabase/schema.sql applied (local CLI or
 * hosted), the worker running against the same project (LLM_FIXTURES=replay is fine), and
 * NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY set.
 * Email confirmation is skipped by confirming the test user with the service-role key.
 */

test.skip(!process.env.E2E_FULL_STACK, "set E2E_FULL_STACK=1 with Supabase and a worker to run the full-stack journey");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const admin = () => createClient(url, service, { auth: { persistSession: false } });
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

async function signUpConfirmed(page: Page, email: string, password: string) {
  await page.goto("/signup");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/Check your email|A few things before we start/)).toBeVisible();
  const db = admin();
  const users = await db.auth.admin.listUsers({ perPage: 200 });
  const user = users.data.users.find((u) => u.email === email)!;
  await db.auth.admin.updateUserById(user.id, { email_confirm: true });
  await page.goto("/signin");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  return user.id;
}

async function noSeriousAxe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
  expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
}

test("under-18 sign-ups are blocked and removed", async ({ page }) => {
  const email = `minor-${Date.now()}@example.com`;
  const id = await signUpConfirmed(page, email, randomBytes(12).toString("base64url"));
  await page.goto("/onboarding");
  await page.getByLabel("Full name").fill("Young Person");
  await page.getByLabel("Date of birth").fill("01/01/2012");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "This service is for adults" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/adults-only/);
  const { data } = await admin().auth.admin.getUserById(id);
  expect(data.user).toBeNull();
});

test("full journey to a receipt, with chaos obstacles and every human checkpoint", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  const email = `e2e-${Date.now()}@example.com`;
  await signUpConfirmed(page, email, randomBytes(12).toString("base64url"));

  // Onboarding: about you, language, three separate consents.
  await page.goto("/onboarding");
  await page.getByLabel("Full name").fill(SAMPLE_VALUES.full_name!);
  await page.getByLabel("Date of birth").fill("05/03/2004");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  for (const name of ["Keep my profile", "Read my documents with an AI model", "Let the assistant act on the portal for me"]) {
    await page.getByLabel(new RegExp(name)).check();
  }
  await page.getByRole("button", { name: "Finish and continue" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await noSeriousAxe(page);

  // Choose the scheme and upload synthetic documents.
  await page.goto("/app/new/scholarship_demo");
  await noSeriousAxe(page);
  const dir = mkdtempSync(join(tmpdir(), "docs-"));
  const docs = await sampleDocuments();
  for (const [kind, label] of [["marksheet", "Latest marksheet"], ["income_certificate", "Income certificate"], ["id_proof", "Demo ID card"]] as const) {
    const file = join(dir, `${kind}.pdf`);
    writeFileSync(file, docs[kind]);
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: new RegExp(`Choose file: ${label}`) }).click();
    await (await chooser).setFiles(file);
    await expect(page.getByRole("button", { name: new RegExp(`Replace: ${label}`) })).toBeVisible({ timeout: 30_000 });
  }
  await page.getByRole("button", { name: "I will type my details myself" }).click();

  // Confirm every field (typed by the applicant here).
  await expect(page.getByRole("heading", { name: "Does this look right?" })).toBeVisible({ timeout: 60_000 });
  const typed: Record<string, string> = { ...SAMPLE_VALUES, date_of_birth: "05/03/2004" };
  for (const [key, value] of Object.entries(typed)) {
    const input = page.locator(`#f_${key}`);
    if ((await input.count()) === 0) continue;
    if ((await input.evaluate((el) => el.tagName)) === "SELECT") await input.selectOption(value);
    else await input.fill(value);
  }
  await page.getByRole("button", { name: "These are correct" }).click();
  await expect(page.getByRole("heading", { name: "Here is what we will do" })).toBeVisible();
  await page.getByLabel(/I authorise the assistant/).check();
  await page.getByRole("button", { name: "Start filling" }).click();

  // Checkpoints, answered in the UI as the applicant.
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: /CAPTCHA/ })).toBeVisible({ timeout: 180_000 });
  const prompt = (await dialog.locator("p.text-lg").innerText()).trim();
  const m = /What is (\w+) plus (\w+)/i.exec(prompt)!;
  await dialog.getByLabel("Your answer").fill(String(WORDS.indexOf(m[1]!.toLowerCase()) + WORDS.indexOf(m[2]!.toLowerCase())));
  await dialog.getByRole("button", { name: "Send to the portal" }).click();

  await expect(dialog.getByRole("heading", { name: /one-time password/ })).toBeVisible({ timeout: 240_000 });
  await expect(dialog.getByText(/is your OTP/)).toBeVisible({ timeout: 30_000 });
  const otp = /(\d{6}) is your OTP/.exec(await dialog.getByText(/is your OTP/).innerText())![1]!;
  await dialog.getByLabel("OTP", { exact: true }).fill(otp);
  await dialog.getByRole("button", { name: "Send to the portal" }).click();

  await expect(dialog.getByRole("heading", { name: "Please review before we submit" })).toBeVisible({ timeout: 120_000 });
  await expect(dialog.getByText(SAMPLE_VALUES.bank_ifsc!)).toBeVisible();
  await dialog.getByRole("button", { name: "Approve and submit" }).click();

  await page.getByRole("link", { name: "See your receipt" }).click({ timeout: 120_000 });
  await expect(page.getByText(/^DEMO-SCH-\d{4}-\d{5}$/)).toBeVisible();
  await noSeriousAxe(page);
});

test("row-level security: user A cannot read user B's rows or files", async () => {
  const db = admin();
  const mk = async () => {
    const email = `rls-${Date.now()}-${randomBytes(3).toString("hex")}@example.com`;
    const password = randomBytes(12).toString("base64url");
    const { data } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    const client = createClient(url, anon, { auth: { persistSession: false } });
    await client.auth.signInWithPassword({ email, password });
    return { id: data.user!.id, client };
  };
  const a = await mk();
  const b = await mk();
  await b.client.from("consents").insert({ user_id: b.id, purpose: "store_profile", granted: true, notice_version: "t" });
  await b.client.storage.from("user-documents").upload(`${b.id}/x.pdf`, Buffer.from("%PDF-1.4 test"), { contentType: "application/pdf" });

  expect((await a.client.from("consents").select("*").eq("user_id", b.id)).data).toEqual([]);
  expect((await a.client.from("consents").insert({ user_id: b.id, purpose: "store_profile", granted: false, notice_version: "t" })).error).not.toBeNull();
  expect((await a.client.storage.from("user-documents").download(`${b.id}/x.pdf`)).error).not.toBeNull();
  expect((await a.client.storage.from("user-documents").upload(`${b.id}/y.pdf`, Buffer.from("%PDF-1.4"), { contentType: "application/pdf" })).error).not.toBeNull();
  expect((await a.client.from("demo_applications").select("*")).data ?? []).toEqual([]);

  await db.storage.from("user-documents").remove([`${b.id}/x.pdf`]);
  await db.auth.admin.deleteUser(a.id);
  await db.auth.admin.deleteUser(b.id);
});

test("retention job deletes expired documents and screenshots", async ({ request }) => {
  const db = admin();
  const { data } = await db.auth.admin.createUser({ email: `ret-${Date.now()}@example.com`, password: randomBytes(12).toString("base64url"), email_confirm: true });
  const uid = data.user!.id;
  const key = `${uid}/old.pdf`;
  await db.storage.from("user-documents").upload(key, Buffer.from("%PDF-1.4 old"), { contentType: "application/pdf" });
  const doc = await db
    .from("documents")
    .insert({ user_id: uid, kind: "marksheet", storage_key: key, sha256: "0".repeat(64), mime: "application/pdf", size_bytes: 12, expires_at: new Date(Date.now() - 1000).toISOString() })
    .select("id")
    .single();
  const res = await request.get("/api/cron/retention", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  expect(res.ok()).toBe(true);
  expect((await db.from("documents").select("id").eq("id", (doc.data as { id: string }).id)).data).toEqual([]);
  expect((await db.storage.from("user-documents").download(key)).error).not.toBeNull();
  expect((await request.get("/api/cron/retention")).status()).toBe(401);
  await db.auth.admin.deleteUser(uid);
});

test("deleting the account removes every row and stored file", async ({ page }) => {
  const email = `del-${Date.now()}@example.com`;
  const uid = await signUpConfirmed(page, email, randomBytes(12).toString("base64url"));
  const db = admin();
  await db.storage.from("user-documents").upload(`${uid}/a.pdf`, Buffer.from("%PDF-1.4 a"), { contentType: "application/pdf" });
  await db.from("accounts").upsert({ user_id: uid, onboarded_at: new Date().toISOString() });
  await db.from("consents").insert({ user_id: uid, purpose: "store_profile", granted: true, notice_version: "t" });
  await page.goto("/app/settings");
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByRole("button", { name: "Delete everything" }).click();
  await expect(page).toHaveURL(/\/\?deleted=1/);
  expect((await db.auth.admin.getUserById(uid)).data.user).toBeNull();
  expect((await db.from("consents").select("id").eq("user_id", uid)).data).toEqual([]);
  expect((await db.storage.from("user-documents").list(uid)).data ?? []).toEqual([]);
});
