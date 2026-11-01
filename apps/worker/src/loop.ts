import { chromium, type Browser } from "playwright";
import type { WorkerEnv } from "@app/shared/env";
import type { EgressAllowlist } from "@app/shared";
import { executeRun } from "./executor/executor";
import { runExtraction } from "./extraction";
import type { LLMClient } from "./llm/types";
import { errorMessage, log } from "./logger";
import type { RunRecord, RunStore } from "./store/types";

/**
 * Postgres is the queue. The loop claims one run at a time (Chromium is heavy
 * on free hosts), polls every POLL_INTERVAL_MS while there is recent activity,
 * and backs off to IDLE_POLL_INTERVAL_MS otherwise. /wake resets it.
 */
export class JobLoop {
  private browser: Browser | null = null;
  private timer: NodeJS.Timeout | null = null;
  private stopping = false;
  private busy = false;
  private activeUntil = 0;
  private lastExpireCheck = 0;
  current: string | null = null;

  constructor(
    private readonly env: WorkerEnv,
    private readonly store: RunStore,
    private readonly llm: LLMClient,
    private readonly allowlist: EgressAllowlist,
    private readonly workerId: string,
  ) {}

  get isBusy(): boolean {
    return this.busy;
  }

  start(): void {
    this.activeUntil = Date.now() + 60_000;
    this.schedule(0);
  }

  wake(): void {
    this.activeUntil = Date.now() + 10 * 60_000;
    if (!this.busy) this.schedule(0);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    const deadline = Date.now() + 20_000;
    while (this.busy && Date.now() < deadline) await new Promise((r) => setTimeout(r, 250));
    await this.browser?.close().catch(() => undefined);
  }

  private schedule(ms: number) {
    if (this.stopping) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(), ms);
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    this.browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
    return this.browser;
  }

  private async tick(): Promise<void> {
    if (this.busy || this.stopping) return;
    this.busy = true;
    let claimed: RunRecord | null = null;
    try {
      if (Date.now() - this.lastExpireCheck > 60_000) {
        this.lastExpireCheck = Date.now();
        const n = await this.store.expireStaleRuns();
        if (n) log.info("expired stale runs", { count: n });
      }
      claimed = await this.store.claimNextRun(this.workerId);
      if (claimed) {
        this.activeUntil = Date.now() + 10 * 60_000;
        await this.process(claimed);
      }
    } catch (e) {
      log.error("worker tick failed", { error: errorMessage(e) });
    } finally {
      this.busy = false;
      this.current = null;
      const active = claimed !== null || Date.now() < this.activeUntil;
      this.schedule(claimed ? 0 : active ? this.env.POLL_INTERVAL_MS : this.env.IDLE_POLL_INTERVAL_MS);
    }
  }

  private async process(run: RunRecord): Promise<void> {
    this.current = run.id;
    const heartbeat = setInterval(() => {
      this.store.extendLease(run.id, this.workerId).catch(() => undefined);
    }, 30_000);
    try {
      log.info("claimed run", { run: run.id, status: run.status, attempt: run.attempt });
      if (run.status === "QUEUED") {
        await runExtraction(this.store, this.llm, run);
        return;
      }
      const status = await executeRun(
        {
          store: this.store,
          llm: this.llm,
          browser: await this.getBrowser(),
          allowlist: this.allowlist,
          portalBaseUrl: this.env.DEMO_PORTAL_BASE_URL,
          enableRealPortals: this.env.ENABLE_REAL_PORTALS,
          workerId: this.workerId,
          humanWaitMs: this.env.HUMAN_WAIT_MINUTES * 60_000,
          runTimeoutMs: this.env.RUN_TIMEOUT_MINUTES * 60_000,
        },
        run,
      );
      log.info("run finished", { run: run.id, status });
    } catch (e) {
      log.error("run crashed", { run: run.id, error: errorMessage(e) });
      await this.store
        .setStatus(run.id, "FAILED", { error: "Something went wrong on our side. Nothing was submitted. Please try again." })
        .catch(() => undefined);
    } finally {
      clearInterval(heartbeat);
    }
  }
}
