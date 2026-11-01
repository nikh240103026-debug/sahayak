import type { Browser, BrowserContext, Page } from "playwright";
import {
  GLOBAL_DISMISS_LABELS,
  buildPlan,
  confirmedValue,
  describeVariant,
  extensionFor,
  formatValue,
  isUrlAllowed,
  namedVariants,
  normalizeLabel,
  receiptSummary,
  redactFieldValue,
  redactText,
  scanForInjection,
  validateProposedAction,
  valueVariants,
  type EgressAllowlist,
  type PageSnapshot,
  type Plan,
  type Profile,
  type RunStatus,
  type ServiceDefinition,
  type ValidatedAction,
  type WorkflowAction,
  type WorkflowStep,
} from "@app/shared";
import { brand } from "@app/shared/brand";
import type { LLMClient } from "../llm/types";
import { situationKey } from "../llm/fixtures";
import { errorMessage, log } from "../logger";
import type { DocumentRecord, RunRecord, RunStore, StepInput } from "../store/types";
import { attachEgressGuard } from "./egress";
import { renderReceiptPdf } from "./receipt";
import { refLocator, takeSnapshot } from "./snapshot";

export interface ExecutorDeps {
  store: RunStore;
  llm: LLMClient;
  browser: Browser;
  allowlist: EgressAllowlist;
  /** Base URL of the portal (the demo portal unless real portals are enabled). */
  portalBaseUrl: string;
  enableRealPortals: boolean;
  workerId: string;
  humanWaitMs: number;
  runTimeoutMs: number;
  approvalPollMs?: number;
  actionTimeoutMs?: number;
}

/** Ends a run in a specific state with a message meant for the applicant. */
export class RunAborted extends Error {
  constructor(
    readonly status: Extract<RunStatus, "CANCELLED" | "PAUSED_EXPIRED" | "FAILED" | "NEEDS_PROFILE_CONFIRM">,
    message: string,
  ) {
    super(message);
  }
}

const MAX_RETRIES_PER_STEP = 3;
const MAX_MODEL_ACTIONS_PER_RECOVERY = 6;
const MAX_RELOGINS = 3;

type Problem = { kind: "action_failed" | "validation" | "not_done"; detail: string };

class RunExecution {
  private service!: ServiceDefinition;
  private profile!: Profile;
  private docs: DocumentRecord[] = [];
  private context: BrowserContext | null = null;
  private page!: Page;
  private sensitiveSelectors: string[] = [];
  private aiAllowed = false;
  private finalApproved = false;
  private relogins = 0;
  private injectionLogged = false;
  private readonly triedValues = new Map<string, Set<string>>();
  private readonly actionTimeout: number;
  private readonly pollMs: number;

  constructor(
    private readonly deps: ExecutorDeps,
    private readonly run: RunRecord,
  ) {
    this.actionTimeout = deps.actionTimeoutMs ?? 6000;
    this.pollMs = deps.approvalPollMs ?? 2000;
  }

  /* ------------------------------- logging ------------------------------- */

  private async log(entry: Partial<StepInput> & { action: string; result: StepInput["result"] }) {
    await this.deps.store.appendStep(this.run, {
      step_id: entry.step_id ?? this.run.current_step ?? null,
      target_label: entry.target_label ?? null,
      value_redacted: entry.value_redacted ?? null,
      message: entry.message ? redactText(entry.message).slice(0, 500) : null,
      action: entry.action,
      result: entry.result,
      screenshot: entry.screenshot,
    });
  }

  private async screenshot(highlightSelector?: string): Promise<Buffer | undefined> {
    try {
      if (highlightSelector) {
        await this.page
          .locator(highlightSelector)
          .first()
          .evaluate((el: HTMLElement) => {
            el.style.outline = "3px solid #E8A33D";
            el.style.outlineOffset = "2px";
          })
          .catch(() => undefined);
      }
      const mask = [
        ...this.sensitiveSelectors.map((s) => this.page.locator(s)),
        this.page.locator("input[type=password]"),
      ];
      const shot = await this.page.screenshot({ type: "jpeg", quality: 60, mask, maskColor: "#2B3A67", caret: "initial" });
      if (highlightSelector) {
        await this.page
          .locator(highlightSelector)
          .first()
          .evaluate((el: HTMLElement) => {
            el.style.outline = "";
            el.style.outlineOffset = "";
          })
          .catch(() => undefined);
      }
      return shot;
    } catch {
      return undefined;
    }
  }

  /* ------------------------------- lifecycle ------------------------------ */

  async execute(): Promise<void> {
    const { store } = this.deps;
    this.service = await store.getService(this.run.service_slug);
    if (this.service.portalKind === "real" && !this.deps.enableRealPortals) {
      throw new RunAborted("FAILED", "Real portals are switched off on this server, so we did not start.");
    }
    if (!(await store.latestConsent(this.run.user_id, "agent_actions"))) {
      throw new RunAborted(
        "FAILED",
        "You have not given permission for the assistant to act on the portal. Turn it on in Settings, then restart.",
      );
    }
    this.profile = await store.getProfile(this.run.user_id);
    this.docs = await store.getDocuments(this.run.user_id);
    const plan = buildPlan(this.service, this.profile, new Set(this.docs.map((d) => d.kind)));
    if (!plan.ready) throw new RunAborted("NEEDS_PROFILE_CONFIRM", missingMessage(this.service, plan));

    this.aiAllowed = this.deps.llm.enabled && (await store.latestConsent(this.run.user_id, "ai_processing"));
    const sensitiveFields = new Set(this.service.fields.filter((f) => f.sensitive).map((f) => f.key));
    this.sensitiveSelectors = this.service.workflow.steps.flatMap((s) =>
      s.actions.flatMap((a) =>
        (a.do === "fill" || a.do === "select") && sensitiveFields.has(a.field)
          ? [a.selector]
          : a.do === "human"
            ? [a.inputSelector]
            : [],
      ),
    );

    await store.setStatus(this.run.id, "EXECUTING", { error: null });
    this.context = await this.deps.browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: "en-IN",
      timezoneId: "Asia/Kolkata",
      acceptDownloads: false,
      serviceWorkers: "block",
    });
    await attachEgressGuard(this.context, this.deps.allowlist, (url) =>
      this.log({
        action: "blocked_request",
        result: "blocked",
        target_label: safeHost(url),
        message: "We blocked the browser from contacting a site that is not on the allowed list.",
      }),
    );
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.actionTimeout);
    await this.log({
      action: "start",
      result: "info",
      step_id: null,
      message: "We opened a fresh, private browser for this application. It keeps no cookies from before.",
    });

    for (const step of this.service.workflow.steps) {
      await this.checkControl();
      await this.runStep(step);
    }
  }

  async close(): Promise<void> {
    await this.context?.close().catch(() => undefined);
    this.context = null;
  }

  /** Cancel and pause requests from the applicant are honoured between actions. */
  private async checkControl(): Promise<void> {
    const fresh = await this.deps.store.getRun(this.run.id);
    if (!fresh) throw new RunAborted("CANCELLED", "This application was removed.");
    if (fresh.control === "cancel") {
      throw new RunAborted("CANCELLED", "You cancelled this application. Nothing was submitted.");
    }
    if (fresh.control === "pause") {
      await this.deps.store.setStatus(this.run.id, "AWAITING_HUMAN");
      await this.log({ action: "pause", result: "waiting", message: "Paused at your request. Press Resume when you are ready." });
      const until = Date.now() + this.deps.humanWaitMs;
      for (;;) {
        await sleep(this.pollMs);
        const r = await this.deps.store.getRun(this.run.id);
        if (!r || r.control === "cancel") {
          throw new RunAborted("CANCELLED", "You cancelled this application. Nothing was submitted.");
        }
        if (r.control === "none") break;
        if (Date.now() > until) {
          throw new RunAborted("PAUSED_EXPIRED", "The pause lasted more than 10 minutes, so we closed the portal. You can restart.");
        }
      }
      await this.deps.store.setStatus(this.run.id, "EXECUTING");
      await this.log({ action: "resume", result: "info", message: "Resumed." });
    }
  }

  /* -------------------------------- steps -------------------------------- */

  private async runStep(step: WorkflowStep): Promise<void> {
    this.run.current_step = step.id;
    await this.deps.store.setCurrentStep(this.run.id, step.id);
    if (step.phase === "approve") return this.finalApproval(step);
    if (step.phase === "submit") return this.submit(step);
    await this.runActions(step);
    await this.ensureDone(step);
  }

  private async runActions(step: WorkflowStep, opts: { skipGoto?: boolean; from?: number } = {}): Promise<void> {
    for (const [index, action] of step.actions.entries()) {
      if (index < (opts.from ?? 0)) continue;
      if (opts.skipGoto && action.do === "goto") continue;
      await this.checkControl();
      try {
        await this.perform(step, action);
      } catch (e) {
        if (e instanceof RunAborted) throw e;
        if (await this.handleSessionExpiry(step)) return this.runActions(step, { skipGoto: true });
        await this.log({
          action: action.do,
          result: "retry",
          target_label: "label" in action ? action.label : null,
          message: "That did not work the first time. We are looking at the page to see why.",
        });
        const recovered = await this.recover(step, {
          kind: "action_failed",
          detail: `${describeAction(action)} failed: ${shortError(e)}`,
        });
        if (!recovered) throw this.stuck(step, "We could not get past a problem on this page.");
        try {
          await this.perform(step, action);
        } catch (e2) {
          if (e2 instanceof RunAborted) throw e2;
          throw this.stuck(step, `The portal kept refusing "${"label" in action ? action.label : action.do}".`);
        }
      }
    }
  }

  private isDone(step: WorkflowStep): boolean {
    const url = this.page.url();
    if (step.done.urlIncludes && !url.includes(step.done.urlIncludes)) return false;
    if (step.done.urlNotIncludes && url.includes(step.done.urlNotIncludes)) return false;
    return true;
  }

  private async ensureDone(step: WorkflowStep): Promise<void> {
    let lastError = "";
    for (let attempt = 0; attempt <= MAX_RETRIES_PER_STEP; attempt++) {
      await this.page.waitForLoadState("domcontentloaded").catch(() => undefined);
      if (this.isDone(step)) {
        await this.log({ action: "step_done", result: "ok", target_label: step.title.en, message: `${step.title.en}: done.` });
        return;
      }
      if (await this.handleSessionExpiry(step)) {
        if (this.isDone(step)) continue;
        await this.runActions(step, { skipGoto: true });
        continue;
      }
      if (attempt === MAX_RETRIES_PER_STEP) break;
      const errors = await this.readErrors();
      lastError = errors.join(" ");
      if (errors.length && (await this.retryHumanCheckpoint(step))) continue;
      const problem: Problem = errors.length
        ? { kind: "validation", detail: lastError }
        : { kind: "not_done", detail: `Expected the next page but the portal is still on ${new URL(this.page.url()).pathname}` };
      await this.log({
        action: "validation",
        result: "retry",
        target_label: step.title.en,
        message: errors.length ? `The portal said: ${lastError}` : "The portal did not move on to the next page.",
        screenshot: await this.screenshot(),
      });
      if (!(await this.recover(step, problem))) break;
      await this.resubmit(step);
    }
    throw this.stuck(
      step,
      lastError
        ? `The portal did not accept the "${step.title.en}" section. It said: "${redactText(lastError).slice(0, 200)}"`
        : `The portal did not accept the "${step.title.en}" section.`,
    );
  }

  /**
   * A CAPTCHA or OTP answer was not accepted and the portal asks again: refill
   * any fields the page cleared, then hand the new question to the human again.
   */
  private async retryHumanCheckpoint(step: WorkflowStep): Promise<boolean> {
    const humanIdx = step.actions.findIndex((a) => a.do === "human");
    if (humanIdx < 0) return false;
    const human = step.actions[humanIdx] as Extract<WorkflowAction, { do: "human" }>;
    if (!(await this.page.locator(human.inputSelector).isVisible().catch(() => false))) return false;
    await this.log({
      action: "request_human",
      result: "retry",
      target_label: human.kind.toUpperCase(),
      message: "The portal did not accept that answer and asked again.",
    });
    for (const a of step.actions.slice(0, humanIdx)) {
      if (a.do !== "fill") continue;
      const loc = this.page.locator(a.selector);
      if ((await loc.isVisible().catch(() => false)) && (await loc.inputValue().catch(() => "x")) === "") {
        await this.perform(step, a);
      }
    }
    await this.runActions(step, { from: humanIdx });
    return true;
  }

  /** Press the step's own save button again after a fix. */
  private async resubmit(step: WorkflowStep): Promise<void> {
    const click = [...step.actions].reverse().find((a) => a.do === "click");
    if (!click || click.do !== "click") return;
    try {
      await this.clickAndSettle(this.page.locator(click.selector));
      await this.log({ action: "click", result: "ok", target_label: click.label });
    } catch (e) {
      await this.log({ action: "click", result: "error", target_label: click.label, message: shortError(e) });
    }
  }

  private stuck(step: WorkflowStep, why: string): RunAborted {
    return new RunAborted(
      "NEEDS_PROFILE_CONFIRM",
      `${why} We stopped instead of guessing. Please check your details for "${step.title.en}" and restart.`,
    );
  }

  private async readErrors(): Promise<string[]> {
    try {
      const texts = await this.page.locator(this.service.workflow.errorSelector).allInnerTexts();
      return texts.map((t) => redactText(t.replace(/\s+/g, " ").trim())).filter(Boolean);
    } catch {
      return [];
    }
  }

  private async handleSessionExpiry(step: WorkflowStep): Promise<boolean> {
    const { urlIncludes, loginStep } = this.service.workflow.sessionExpired;
    if (step.id === loginStep || !this.page.url().includes(urlIncludes)) return false;
    if (++this.relogins > MAX_RELOGINS) {
      throw new RunAborted("FAILED", "The portal kept signing us out, so we stopped. You can try again later.");
    }
    await this.log({ action: "relogin", result: "info", message: "The portal signed us out. We are signing in again." });
    const login = this.service.workflow.steps.find((s) => s.id === loginStep)!;
    await this.runActions(login, { skipGoto: true });
    await this.page.waitForLoadState("domcontentloaded").catch(() => undefined);
    if (this.page.url().includes(urlIncludes)) {
      throw new RunAborted("FAILED", "We could not sign in to the portal again.");
    }
    return true;
  }

  /* ------------------------------- actions ------------------------------- */

  private valueFor(field: string): string {
    const v = confirmedValue(this.profile, field);
    if (v === null) {
      // Never invent a value: stop and ask.
      const def = this.service.fields.find((f) => f.key === field);
      throw new RunAborted("NEEDS_PROFILE_CONFIRM", `We need your "${def?.label.en ?? field}" before we can continue.`);
    }
    return v;
  }

  private isSensitive(field: string): boolean {
    return this.service.fields.find((f) => f.key === field)?.sensitive ?? true;
  }

  private async clickAndSettle(locator: ReturnType<Page["locator"]>): Promise<void> {
    const nav = this.page
      .waitForEvent("framenavigated", { predicate: (f) => f === this.page.mainFrame(), timeout: 2500 })
      .catch(() => undefined);
    await locator.click({ timeout: this.actionTimeout });
    await nav;
    await this.page.waitForLoadState("domcontentloaded").catch(() => undefined);
  }

  private async selectByLabel(locator: ReturnType<Page["locator"]>, label: string, wait: boolean): Promise<void> {
    const want = label.trim().toLowerCase();
    const findLabel = () =>
      locator.evaluate(
        (el: HTMLSelectElement, w: string) =>
          Array.from(el.options)
            .map((o) => o.text.trim())
            .find((t) => t.toLowerCase() === w) ?? null,
        want,
      );
    let exact = await findLabel();
    const until = Date.now() + (wait ? 15000 : 0);
    while (!exact && Date.now() < until) {
      await sleep(300);
      exact = await findLabel();
    }
    if (!exact) throw new Error(`option "${label}" is not in the list`);
    await locator.selectOption({ label: exact }, { timeout: this.actionTimeout });
  }

  private document(kind: string): DocumentRecord {
    const doc = this.docs.find((d) => d.kind === kind);
    if (!doc) throw new RunAborted("NEEDS_PROFILE_CONFIRM", `Please upload your ${kind.replace(/_/g, " ")} first.`);
    return doc;
  }

  private async perform(step: WorkflowStep, action: WorkflowAction): Promise<void> {
    const page = this.page;
    switch (action.do) {
      case "goto": {
        const url = new URL(action.path, this.deps.portalBaseUrl);
        if (action.passChaos && this.run.chaos) url.searchParams.set("chaos", "1");
        if (!isUrlAllowed(url.toString(), this.deps.allowlist)) {
          throw new RunAborted("FAILED", "The portal address is not on the allowed list, so we did not open it.");
        }
        await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
        await this.log({ action: "goto", result: "ok", target_label: url.pathname, message: "Opened the portal." });
        return;
      }
      case "fill": {
        const def = this.service.fields.find((f) => f.key === action.field)!;
        const value = formatValue(def, this.valueFor(action.field), action.format);
        await page.locator(action.selector).fill(value, { timeout: this.actionTimeout });
        this.triedValues.set(action.selector, new Set([value]));
        await this.log({
          action: "fill",
          result: "ok",
          target_label: action.label,
          value_redacted: redactFieldValue(value, def.sensitive),
        });
        return;
      }
      case "select": {
        const value = this.valueFor(action.field);
        await this.selectByLabel(page.locator(action.selector), value, action.waitForOptions === true);
        await this.log({
          action: "select",
          result: "ok",
          target_label: action.label,
          value_redacted: redactFieldValue(value, this.isSensitive(action.field)),
        });
        return;
      }
      case "click": {
        const shot = await this.screenshot();
        await this.clickAndSettle(page.locator(action.selector));
        await this.log({ action: "click", result: "ok", target_label: action.label, screenshot: shot });
        return;
      }
      case "check": {
        if (action.requiresApproval && !this.finalApproved) {
          throw new RunAborted("FAILED", "Safety stop: this needs your final approval first.");
        }
        await page.locator(action.selector).check({ timeout: this.actionTimeout });
        await this.log({ action: "check", result: "ok", target_label: action.label });
        return;
      }
      case "upload": {
        const doc = this.document(action.doc);
        const bytes = await this.deps.store.downloadDocument(doc); // checksum-verified, unchanged
        await page.locator(action.selector).setInputFiles(
          { name: `${doc.kind}.${extensionFor(doc.mime)}`, mimeType: doc.mime, buffer: bytes },
          { timeout: this.actionTimeout },
        );
        await this.log({
          action: "upload",
          result: "ok",
          target_label: action.label,
          message: "Attached your file exactly as you uploaded it.",
        });
        return;
      }
      case "human":
        return this.humanCheckpoint(step, action);
      case "approve":
      case "submit":
        throw new Error(`${action.do} is handled by its own phase`);
    }
  }

  /* ------------------------------- recovery ------------------------------ */

  private noteInjection(snapshot: PageSnapshot, modelFlagged = false) {
    const scan = scanForInjection([snapshot.text, ...snapshot.dialogs, ...snapshot.alerts].join("\n"));
    if ((scan.suspicious || modelFlagged) && !this.injectionLogged) {
      this.injectionLogged = true;
      log.warn("suspicious page instructions ignored", { run: this.run.id, patterns: scan.matches });
      void this.log({
        action: "ignored_instructions",
        result: "blocked",
        message:
          "The page contained text trying to give the assistant new instructions. We ignored it and kept to your application.",
      });
    }
  }

  private async recover(step: WorkflowStep, problem: Problem): Promise<boolean> {
    const snapshot = await takeSnapshot(this.page, this.sensitiveSelectors, this.service.workflow.errorSelector);
    this.noteInjection(snapshot);
    if (this.aiAllowed) {
      try {
        return await this.recoverWithModel(step, problem, snapshot);
      } catch (e) {
        if (e instanceof RunAborted) throw e;
        log.warn("model recovery failed, using built-in recovery", { run: this.run.id, error: errorMessage(e) });
      }
    }
    return this.recoverDeterministically(step, problem, snapshot);
  }

  private fieldMapFor(step: WorkflowStep) {
    const entries = [];
    for (const a of step.actions) {
      if (a.do !== "fill" && a.do !== "select") continue;
      const def = this.service.fields.find((f) => f.key === a.field);
      const value = confirmedValue(this.profile, a.field);
      if (!def || value === null) continue;
      entries.push({
        field: a.field,
        portalLabel: a.label,
        formats: (a.do === "select" ? namedVariants(def, value).slice(0, 1) : namedVariants(def, value)).map((v) => ({
          format: v.format,
          shape: describeVariant(def, v),
        })),
      });
    }
    return entries;
  }

  private async recoverWithModel(step: WorkflowStep, problem: Problem, first: PageSnapshot): Promise<boolean> {
    let snapshot = first;
    const history: string[] = [];
    const fixtureBase = `propose:${step.id}:${situationKey(first, problem.kind)}`;
    for (let k = 0; k < MAX_MODEL_ACTIONS_PER_RECOVERY; k++) {
      const { value: proposal, usage } = await this.deps.llm.proposeAction({
        stepId: step.id,
        stepTitle: step.title.en,
        goal: step.goal,
        problem: `${problem.kind === "validation" ? "Validation error" : "Problem"}: ${redactText(problem.detail).slice(0, 400)}`,
        fieldMap: this.fieldMapFor(step),
        allowedClicks: step.allowedClicks,
        history,
        snapshot,
        fixtureKey: fixtureBase,
      });
      await this.deps.store.addLlmUsage(this.run.id, usage);
      if (proposal.suspicious_page_instructions) this.noteInjection(snapshot, true);

      const verdict = validateProposedAction(proposal, {
        service: this.service,
        step,
        profile: this.profile,
        snapshot,
        allowlist: this.deps.allowlist,
        baseUrl: this.deps.portalBaseUrl,
        finalApprovalGranted: this.finalApproved,
      });
      if (!verdict.ok) {
        await this.log({
          action: proposal.type,
          result: "blocked",
          message: `We stopped an unsafe or invalid step: ${verdict.reason}.`,
        });
        history.push(`${proposal.type} was rejected: ${verdict.reason}`);
        continue;
      }
      const a = verdict.action;
      if (a.type === "finish") return true;
      if (a.type === "request_human") {
        await this.log({ action: "request_human", result: "info", message: a.reason });
        return false;
      }
      try {
        await this.performValidated(a);
        history.push(`${describeValidated(a)} succeeded`);
      } catch (e) {
        history.push(`${describeValidated(a)} failed: ${shortError(e)}`);
        await this.log({ action: a.type, result: "error", message: shortError(e) });
      }
      snapshot = await takeSnapshot(this.page, this.sensitiveSelectors, this.service.workflow.errorSelector);
    }
    return false;
  }

  private async performValidated(a: ValidatedAction): Promise<void> {
    const page = this.page;
    switch (a.type) {
      case "goto":
        await page.goto(a.url, { waitUntil: "domcontentloaded" });
        await this.log({ action: "goto", result: "ok", target_label: new URL(a.url).pathname });
        return;
      case "click":
        await this.clickAndSettle(refLocator(page, a.ref));
        await this.log({ action: "click", result: "ok", target_label: a.label });
        return;
      case "fill": {
        await refLocator(page, a.ref).fill(a.value, { timeout: this.actionTimeout });
        const label = this.service.fields.find((f) => f.key === a.field)?.label.en ?? a.field;
        await this.log({
          action: "fill",
          result: "ok",
          target_label: label,
          value_redacted: redactFieldValue(a.value, this.isSensitive(a.field)),
          message: "Typed again in the format the portal asked for.",
        });
        return;
      }
      case "select":
        await this.selectByLabel(refLocator(page, a.ref), a.value, true);
        await this.log({
          action: "select",
          result: "ok",
          target_label: this.service.fields.find((f) => f.key === a.field)?.label.en ?? a.field,
          value_redacted: redactFieldValue(a.value, this.isSensitive(a.field)),
        });
        return;
      case "check":
        await refLocator(page, a.ref).check({ timeout: this.actionTimeout });
        await this.log({ action: "check", result: "ok", target_label: a.label });
        return;
      case "upload": {
        const doc = this.document(a.doc);
        const bytes = await this.deps.store.downloadDocument(doc);
        await refLocator(page, a.ref).setInputFiles({
          name: `${doc.kind}.${extensionFor(doc.mime)}`,
          mimeType: doc.mime,
          buffer: bytes,
        });
        await this.log({ action: "upload", result: "ok", target_label: a.doc });
        return;
      }
      case "press":
        await page.keyboard.press(a.key);
        return;
      case "wait":
        await sleep(a.ms);
        return;
      case "request_human":
      case "finish":
        return;
    }
  }

  /** Built-in recovery when the model is off or not allowed: close notices, then try format variants. */
  private async recoverDeterministically(step: WorkflowStep, problem: Problem, snapshot: PageSnapshot): Promise<boolean> {
    const dismiss = snapshot.elements.find(
      (e) =>
        e.inDialog &&
        (e.role === "button" || e.tag === "button") &&
        GLOBAL_DISMISS_LABELS.some((l) => normalizeLabel(e.name) === l || normalizeLabel(e.name).startsWith(l)),
    );
    if (dismiss) {
      await this.clickAndSettle(refLocator(this.page, dismiss.ref));
      await this.log({ action: "click", result: "ok", target_label: dismiss.name, message: "Closed a notice that was in the way." });
      return true;
    }
    if (problem.kind !== "validation") return false;
    const errorText = normalizeLabel(problem.detail);
    let changed = false;
    for (const a of step.actions) {
      if (a.do !== "fill" || !errorText.includes(normalizeLabel(a.label))) continue;
      const def = this.service.fields.find((f) => f.key === a.field)!;
      const value = this.valueFor(a.field);
      const tried = this.triedValues.get(a.selector) ?? new Set<string>();
      const next = valueVariants(def, value).find((v) => !tried.has(v));
      if (!next) continue;
      tried.add(next);
      this.triedValues.set(a.selector, tried);
      await this.page.locator(a.selector).fill(next, { timeout: this.actionTimeout });
      await this.log({
        action: "fill",
        result: "retry",
        target_label: a.label,
        value_redacted: redactFieldValue(next, def.sensitive),
        message: "Typed again in a different format.",
      });
      changed = true;
    }
    return changed;
  }

  /* ---------------------------- human checkpoints ------------------------ */

  private async waitForDecision(approvalId: string, expiresAt: Date): Promise<"approved" | "rejected" | "provided" | "expired"> {
    for (;;) {
      const a = await this.deps.store.getApproval(approvalId);
      if (a?.decision && a.decision !== "expired") return a.decision;
      if (a?.decision === "expired") return "expired";
      const r = await this.deps.store.getRun(this.run.id);
      if (!r || r.control === "cancel") {
        await this.deps.store.expireApproval(approvalId);
        throw new RunAborted("CANCELLED", "You cancelled this application. Nothing was submitted.");
      }
      if (Date.now() > expiresAt.getTime()) {
        await this.deps.store.expireApproval(approvalId);
        return "expired";
      }
      await sleep(this.pollMs);
    }
  }

  private async humanCheckpoint(step: WorkflowStep, action: Extract<WorkflowAction, { do: "human" }>): Promise<void> {
    if (action.whenVisible && !(await this.page.locator(action.whenVisible).isVisible().catch(() => false))) {
      await this.log({
        action: "request_human",
        result: "info",
        target_label: action.kind.toUpperCase(),
        message: action.kind === "captcha" ? "No CAPTCHA was asked this time." : "No OTP was needed this time.",
      });
      return;
    }
    const prompt = redactText(
      (await this.page.locator(action.promptSelector).innerText({ timeout: this.actionTimeout })).trim(),
    ).slice(0, 300);
    const shot = await this.screenshot(action.inputSelector);
    await this.deps.store.setStatus(this.run.id, "AWAITING_HUMAN");
    const expiresAt = new Date(Date.now() + this.deps.humanWaitMs);
    const approvalId = await this.deps.store.createApproval(
      this.run,
      action.kind,
      { stepId: step.id, prompt, stepTitle: step.title },
      expiresAt,
    );
    await this.log({
      action: "request_human",
      result: "waiting",
      target_label: action.kind === "captcha" ? "CAPTCHA" : "OTP",
      message:
        action.kind === "captcha"
          ? "The portal is asking a CAPTCHA question. We never answer these ourselves, so it is your turn."
          : "The portal sent a one-time password (OTP). We never read or guess OTPs, so it is your turn.",
      screenshot: shot,
    });
    const decision = await this.waitForDecision(approvalId, expiresAt);
    if (decision === "expired") {
      throw new RunAborted(
        "PAUSED_EXPIRED",
        "We waited 10 minutes for you, then closed the portal to keep things safe. You can restart when you are ready.",
      );
    }
    if (decision === "rejected") throw new RunAborted("CANCELLED", "You chose not to continue. Nothing was submitted.");
    const answer = await this.deps.store.takeApprovalResponse(this.run, approvalId);
    if (!answer) throw new RunAborted("PAUSED_EXPIRED", "We did not receive your answer. Please restart.");
    await this.page.locator(action.inputSelector).fill(answer, { timeout: this.actionTimeout });
    await this.deps.store.setStatus(this.run.id, "EXECUTING");
    await this.log({
      action: "fill",
      result: "ok",
      target_label: action.kind === "captcha" ? "CAPTCHA answer" : "OTP",
      value_redacted: "(typed as you gave it)",
    });
  }

  private async finalApproval(step: WorkflowStep): Promise<void> {
    const plan = buildPlan(this.service, this.profile, new Set(this.docs.map((d) => d.kind)));
    const action = step.actions.find((a) => a.do === "approve");
    const previewText = action && action.do === "approve"
      ? await this.page.locator(action.summarySelector).innerText({ timeout: this.actionTimeout }).catch(() => "")
      : "";
    const preview = previewText.toLowerCase();
    // Cross-check: every value we typed should appear on the portal's own preview page.
    const loginStep = this.service.workflow.sessionExpired.loginStep;
    const mismatches = plan.steps.filter((s) => s.id !== loginStep).flatMap((s) =>
      s.entries
        .filter((e) => {
          const def = this.service.fields.find((f) => f.key === e.field)!;
          return preview && !valueVariants(def, confirmedValue(this.profile, e.field) ?? e.value).some((v) =>
            preview.includes(v.toLowerCase()),
          );
        })
        .map((e) => e.label.en),
    );
    const shot = await this.screenshot();
    await this.deps.store.setStatus(this.run.id, "AWAITING_FINAL_APPROVAL");
    const expiresAt = new Date(Date.now() + this.deps.humanWaitMs);
    const approvalId = await this.deps.store.createApproval(
      this.run,
      "final_submit",
      {
        stepId: step.id,
        sections: plan.steps
          .filter((s) => s.entries.length || s.uploads.length)
          .map((s) => ({
            id: s.id,
            title: s.title,
            entries: s.entries.map((e) => ({ field: e.field, label: e.label, value: redactFieldValue(e.value, e.sensitive) })),
            uploads: s.uploads.map((u) => u.label),
          })),
        mismatches,
      },
      expiresAt,
    );
    await this.log({
      action: "request_approval",
      result: "waiting",
      target_label: "Final review",
      message: "Please check every detail. We submit only after you approve.",
      screenshot: shot,
    });
    const decision = await this.waitForDecision(approvalId, expiresAt);
    if (decision === "expired") {
      throw new RunAborted("PAUSED_EXPIRED", "We waited 10 minutes for your approval, then closed the portal. Nothing was submitted.");
    }
    if (decision !== "approved") {
      throw new RunAborted(
        "NEEDS_PROFILE_CONFIRM",
        "You asked to change something before submitting. Nothing was submitted. Update your details, then restart.",
      );
    }
    this.finalApproved = await this.deps.store.hasApprovedFinalSubmit(this.run.id);
    if (!this.finalApproved) throw new RunAborted("FAILED", "Safety stop: we could not find your recorded approval.");
    await this.log({ action: "approval", result: "ok", target_label: "Final review", message: "You approved the submission." });
  }

  private async submit(step: WorkflowStep): Promise<void> {
    const { store } = this.deps;
    if (!this.finalApproved || !(await store.hasApprovedFinalSubmit(this.run.id))) {
      throw new RunAborted("FAILED", "Safety stop: there is no recorded approval, so we did not submit.");
    }
    const existing = await store.getReceipt(this.run.id);
    if (existing) {
      await this.log({ action: "submit", result: "info", message: `Already submitted earlier (${existing.tracking_id}). We did not submit again.` });
      await store.setStatus(this.run.id, "SUBMITTING");
      await store.setStatus(this.run.id, "COMPLETED", { current_step: null });
      return;
    }
    await store.setStatus(this.run.id, "SUBMITTING");
    // The portal uses this key to refuse a second submission of the same application.
    await this.context!.setExtraHTTPHeaders({ "Idempotency-Key": this.run.idempotency_key });

    for (const action of step.actions) {
      if (action.do === "check") {
        await this.perform(step, action);
      } else if (action.do === "submit") {
        const shot = await this.screenshot(action.selector);
        await this.clickAndSettle(this.page.locator(action.selector));
        await this.log({ action: "submit", result: "ok", target_label: action.label, screenshot: shot });
      }
    }
    await this.page.waitForLoadState("domcontentloaded").catch(() => undefined);
    if (!this.isDone(step)) {
      const errors = await this.readErrors();
      throw new RunAborted(
        "FAILED",
        `The portal did not confirm the submission${errors.length ? `: "${errors.join(" ").slice(0, 200)}"` : "."} Check the portal's status page before trying again; a second attempt will not create a duplicate.`,
      );
    }
    const trackingId = step.capture
      ? (await this.page.locator(step.capture.trackingId).innerText({ timeout: this.actionTimeout })).trim()
      : "";
    if (!/^[A-Z0-9][A-Z0-9-]{4,40}$/.test(trackingId)) {
      throw new RunAborted("FAILED", "The portal accepted the form but we could not read a tracking ID. Check the portal's status page.");
    }
    const ack = await this.page.screenshot({ type: "jpeg", quality: 70 });
    await this.log({ action: "receipt", result: "ok", target_label: "Tracking ID", value_redacted: trackingId, screenshot: ack });

    const submittedAt = new Date();
    const facts = {
      serviceName: this.service.name,
      portalName: this.service.portalName ?? { en: brand.demoPortal.en, hi: brand.demoPortal.hi },
      trackingId,
      submittedAt,
      isDemo: this.service.portalKind === "demo",
    };
    const summaryEn = receiptSummary(facts, "en");
    const summaryHi = receiptSummary(facts, "hi");
    const pdf = await renderReceiptPdf(this.deps.browser, {
      ...facts,
      summaryEn,
      summaryHi,
      acknowledgementJpeg: ack,
    });
    await store.saveReceipt(this.run, { trackingId, pdf, summaryEn, summaryHi });
    await store.setStatus(this.run.id, "COMPLETED", { current_step: null, error: null });
  }
}

/* --------------------------------- helpers -------------------------------- */

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "unknown";
  }
}

function shortError(e: unknown): string {
  return redactText(errorMessage(e).split("\n")[0] ?? "").slice(0, 200);
}

function describeAction(a: WorkflowAction): string {
  return "label" in a ? `${a.do} "${a.label}"` : a.do;
}

function describeValidated(a: ValidatedAction): string {
  switch (a.type) {
    case "fill":
    case "select":
      return `${a.type} ${a.field}`;
    case "click":
    case "check":
      return `${a.type} "${a.label}"`;
    default:
      return a.type;
  }
}

function missingMessage(service: ServiceDefinition, plan: Plan): string {
  const fields = plan.missingFields.map((f) => f.label.en);
  const docs = plan.missingDocs.map((k) => service.requiredDocs.find((d) => d.kind === k)?.label.en ?? k);
  const parts = [];
  if (fields.length) parts.push(`these details: ${fields.join(", ")}`);
  if (docs.length) parts.push(`these documents: ${docs.join(", ")}`);
  return `Before we start we still need ${parts.join(" and ")}. We never guess missing values.`;
}

/**
 * Run one claimed run to completion (or to a clean stop). Always leaves the run
 * in a well-defined state and always closes its browser context.
 */
export async function executeRun(deps: ExecutorDeps, run: RunRecord): Promise<RunStatus> {
  const exec = new RunExecution(deps, run);
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new RunAborted(
            "PAUSED_EXPIRED",
            `This application took longer than ${Math.round(deps.runTimeoutMs / 60000)} minutes, so we stopped safely. You can restart.`,
          ),
        ),
      deps.runTimeoutMs,
    );
  });
  const work = exec.execute();
  // After a timeout the context is closed and `work` rejects; that late rejection is expected.
  work.catch(() => undefined);
  try {
    await Promise.race([work, timeout]);
    return "COMPLETED";
  } catch (e) {
    const aborted =
      e instanceof RunAborted
        ? e
        : new RunAborted("FAILED", "Something went wrong on our side. Nothing was submitted unless you see a receipt. Please try again.");
    if (!(e instanceof RunAborted)) log.error("run failed", { run: run.id, error: errorMessage(e) });
    try {
      await deps.store.setStatus(run.id, aborted.status, { error: aborted.message });
    } catch {
      await deps.store.setStatus(run.id, "FAILED", { error: aborted.message }).catch(() => undefined);
    }
    await deps.store
      .appendStep(run, {
        step_id: run.current_step,
        action: "stopped",
        target_label: null,
        value_redacted: null,
        result: aborted.status === "CANCELLED" ? "info" : "error",
        message: aborted.message,
      })
      .catch(() => undefined);
    return aborted.status;
  } finally {
    clearTimeout(timer);
    await exec.close();
  }
}
