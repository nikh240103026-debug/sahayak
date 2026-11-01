/**
 * npm run smoke — end-to-end check of a deployed environment:
 * web health -> worker health -> a fresh test user with the fictional sample
 * profile -> one authorised run on the demo portal -> answers the CAPTCHA, OTP
 * and final approval the way the applicant would -> verifies the receipt ->
 * deletes the test user and everything it created (pass --keep to keep it).
 */
import { randomBytes } from "node:crypto";
import { aad, decryptString, encryptString, portalHmac } from "@app/shared/crypto";
import { WORKER_SIGNATURE_HEADER, signWorkerRequest } from "@app/shared/hmac";
import { SAMPLE_VALUES } from "../e2e/support/sample-applicant";
import { loadEnvFiles } from "./load-env";
import { adminClient, prepareSampleApplicant } from "./lib-seed";

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const step = (m: string) => console.log(`- ${m}`);

async function main() {
  loadEnvFiles();
  const keep = process.argv.includes("--keep");
  const site = process.env.NEXT_PUBLIC_SITE_URL!;
  const worker = process.env.WORKER_URL;
  const db = adminClient();

  const health = await fetch(new URL("/api/health", site)).catch(() => null);
  if (!health?.ok) throw new Error(`web app health check failed at ${site}/api/health`);
  step("web app healthy");
  if (worker) {
    const w = await fetch(new URL("/health", worker), { signal: AbortSignal.timeout(90_000) }).catch(() => null);
    if (!w?.ok) throw new Error(`worker health check failed at ${worker}/health`);
    step("worker healthy");
  }

  const email = `smoke-${Date.now()}@example.com`;
  const userId = await prepareSampleApplicant(db, email, randomBytes(18).toString("base64url"));
  step(`test user ${email} prepared with the fictional sample profile`);

  const ins = await db
    .from("runs")
    .insert({ user_id: userId, service_slug: "scholarship_demo", service_version: 1, status: "QUEUED", manual_entry: true })
    .select("id,idempotency_key")
    .single();
  if (ins.error) throw new Error(ins.error.message);
  const run = ins.data as { id: string; idempotency_key: string };
  // Same path as the app: confirmed profile -> per-run authorisation -> PLANNING.
  await db.from("runs").update({ status: "NEEDS_PROFILE_CONFIRM" }).eq("id", run.id);
  await db.from("runs").update({ status: "PLANNING", authorized_at: new Date().toISOString() }).eq("id", run.id);
  if (worker && process.env.WORKER_SHARED_SECRET) {
    const body = JSON.stringify({ at: Date.now() });
    await fetch(new URL("/wake", worker), {
      method: "POST",
      headers: { "content-type": "application/json", [WORKER_SIGNATURE_HEADER]: signWorkerRequest(process.env.WORKER_SHARED_SECRET, body) },
      body,
    }).catch(() => undefined);
  }
  step(`run ${run.id} authorised; waiting for the worker`);

  let outcome = "";
  try {
    const deadline = Date.now() + 10 * 60_000;
    let last = "";
    while (Date.now() < deadline) {
      const { data } = await db.from("runs").select("status,error").eq("id", run.id).single();
      const r = data as { status: string; error: string | null };
      if (r.status !== last) step(`status: ${r.status}`);
      last = r.status;
      if (["COMPLETED", "FAILED", "CANCELLED", "PAUSED_EXPIRED", "NEEDS_PROFILE_CONFIRM"].includes(r.status)) {
        outcome = r.status === "COMPLETED" ? "" : `${r.status}: ${r.error ?? ""}`;
        break;
      }
      const { data: open } = await db
        .from("approvals")
        .select("id,kind,payload_redacted")
        .eq("run_id", run.id)
        .is("resolved_at", null)
        .limit(1);
      const a = (open ?? [])[0] as { id: string; kind: string; payload_redacted: { prompt?: string } } | undefined;
      if (a) {
        let answer: string | null = null;
        let decision = "provided";
        if (a.kind === "captcha") {
          const m = /What is (\w+) plus (\w+)/i.exec(a.payload_redacted.prompt ?? "");
          answer = m ? String(WORDS.indexOf(m[1]!.toLowerCase()) + WORDS.indexOf(m[2]!.toLowerCase())) : null;
        } else if (a.kind === "otp") {
          const mh = portalHmac("mobile", SAMPLE_VALUES.mobile!);
          const { data: sms } = await db
            .from("demo_sms_outbox")
            .select("message_enc")
            .eq("mobile_hash", mh)
            .order("created_at", { ascending: false })
            .limit(1);
          const enc = (sms ?? [])[0] as { message_enc: string } | undefined;
          answer = enc ? (/(\d{6})/.exec(decryptString(enc.message_enc, aad.demoPortal(`sms:${mh}`)))?.[1] ?? null) : null;
        } else {
          decision = "approved";
        }
        if (decision === "provided") {
          if (!answer) {
            await sleep(2000);
            continue;
          }
          await db.from("approval_responses").upsert({ approval_id: a.id, response_enc: encryptString(answer, aad.approvalResponse(run.id, a.id)) });
        }
        await db.from("approvals").update({ decision, resolved_at: new Date().toISOString() }).eq("id", a.id);
        step(`answered ${a.kind} checkpoint as the applicant`);
      }
      await sleep(2000);
    }
    if (!last) throw new Error("run never started");
    if (outcome) throw new Error(`run ended as ${outcome}`);
    const { data: receipt } = await db.from("receipts").select("tracking_id,receipt_pdf_key").eq("run_id", run.id).single();
    const rec = receipt as { tracking_id: string; receipt_pdf_key: string | null } | null;
    if (!rec || !/^DEMO-SCH-\d{4}-\d{5}$/.test(rec.tracking_id)) throw new Error("no valid receipt");
    step(`receipt ${rec.tracking_id} (pdf: ${rec.receipt_pdf_key ? "stored" : "missing"})`);
    console.log("\nSmoke test passed.");
  } finally {
    if (!keep) {
      for (const bucket of ["user-documents", "run-artifacts"]) {
        const top = await db.storage.from(bucket).list(userId, { limit: 1000 });
        const paths: string[] = [];
        for (const item of top.data ?? []) {
          if (item.id === null) {
            const inner = await db.storage.from(bucket).list(`${userId}/${item.name}`, { limit: 1000 });
            for (const f of inner.data ?? []) paths.push(`${userId}/${item.name}/${f.name}`);
          } else paths.push(`${userId}/${item.name}`);
        }
        if (paths.length) await db.storage.from(bucket).remove(paths);
      }
      await db.from("demo_applications").delete().eq("idempotency_key", run.idempotency_key);
      await db.auth.admin.deleteUser(userId);
      step("test user and all its data deleted");
    }
  }
}

main().catch((e) => {
  console.error(`\nSmoke test FAILED: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
