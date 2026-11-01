import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Basic building blocks                                               */
/* ------------------------------------------------------------------ */

export const LOCALES = ["en", "hi"] as const;
export type Locale = (typeof LOCALES)[number];

export const Localized = z.object({ en: z.string().min(1), hi: z.string().min(1) });
export type Localized = z.infer<typeof Localized>;

const fieldKey = z.string().regex(/^[a-z][a-z0-9_]*$/, "field keys are lower_snake_case");
const docKind = z.string().regex(/^[a-z][a-z0-9_]*$/, "document kinds are lower_snake_case");
const cssSelector = z.string().min(1).max(200);

export const FieldType = z.enum([
  "text",
  "date",
  "enum",
  "phone",
  "email",
  "year",
  "percentage",
  "currency",
  "digits",
]);
export type FieldType = z.infer<typeof FieldType>;

export const FieldDef = z.object({
  key: fieldKey,
  type: FieldType,
  required: z.boolean(),
  sensitive: z.boolean(),
  label: Localized,
  help: Localized.optional(),
  options: z.array(z.string().min(1)).optional(),
  optionsRef: z.enum(["indianStates"]).optional(),
  pattern: z.string().optional(),
  sources: z.array(z.string().regex(/^[a-z_]+\.[a-z_]+$/)),
});
export type FieldDef = z.infer<typeof FieldDef>;

export const ALLOWED_UPLOAD_MIME = ["application/pdf", "image/jpeg", "image/png"] as const;
export type UploadMime = (typeof ALLOWED_UPLOAD_MIME)[number];

export const RequiredDoc = z.object({
  kind: docKind,
  label: Localized,
  hint: Localized,
  maxBytes: z
    .number()
    .int()
    .positive()
    .max(4 * 1024 * 1024),
  mimeTypes: z.array(z.enum(ALLOWED_UPLOAD_MIME)).min(1),
  uploadToPortal: z.boolean(),
  extract: z.array(z.object({ key: fieldKey, description: z.string().min(1) })).min(1),
});
export type RequiredDoc = z.infer<typeof RequiredDoc>;

export const EligibilityRule = z.object({
  id: z.string().min(1),
  field: fieldKey,
  op: z.enum(["gte", "lte", "eq", "in", "between", "ageBetween"]),
  value: z.union([z.number(), z.string(), z.array(z.union([z.number(), z.string()]))]),
  label: Localized,
});
export type EligibilityRule = z.infer<typeof EligibilityRule>;

/* ------------------------------------------------------------------ */
/* Workflow definition                                                 */
/* ------------------------------------------------------------------ */

export const FillFormat = z.enum(["dd/mm/yyyy", "dd-mm-yyyy", "digits", "upper", "fixed2"]);
export type FillFormat = z.infer<typeof FillFormat>;

export const WorkflowAction = z.discriminatedUnion("do", [
  z.object({ do: z.literal("goto"), path: z.string().startsWith("/"), passChaos: z.boolean().optional() }),
  z.object({
    do: z.literal("fill"),
    field: fieldKey,
    selector: cssSelector,
    label: z.string().min(1),
    format: FillFormat.optional(),
  }),
  z.object({
    do: z.literal("select"),
    field: fieldKey,
    selector: cssSelector,
    label: z.string().min(1),
    waitForOptions: z.boolean().optional(),
  }),
  z.object({ do: z.literal("click"), selector: cssSelector, label: z.string().min(1) }),
  z.object({
    do: z.literal("check"),
    selector: cssSelector,
    label: z.string().min(1),
    requiresApproval: z.boolean().optional(),
  }),
  z.object({ do: z.literal("upload"), doc: docKind, selector: cssSelector, label: z.string().min(1) }),
  z.object({
    do: z.literal("human"),
    kind: z.enum(["captcha", "otp"]),
    promptSelector: cssSelector,
    inputSelector: cssSelector,
    whenVisible: cssSelector.optional(),
  }),
  z.object({ do: z.literal("approve"), kind: z.literal("final_submit"), summarySelector: cssSelector }),
  z.object({
    do: z.literal("submit"),
    selector: cssSelector,
    label: z.string().min(1),
    requiresApproval: z.literal(true),
  }),
]);
export type WorkflowAction = z.infer<typeof WorkflowAction>;

export const WorkflowStep = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  title: Localized,
  goal: z.string().min(1),
  phase: z.enum(["execute", "approve", "submit"]),
  note: z.string().optional(),
  actions: z.array(WorkflowAction).min(1),
  allowedClicks: z.array(z.string()),
  done: z.object({
    urlIncludes: z.string().optional(),
    urlNotIncludes: z.string().optional(),
    approved: z.boolean().optional(),
  }),
  capture: z.object({ trackingId: cssSelector }).optional(),
});
export type WorkflowStep = z.infer<typeof WorkflowStep>;

export const Workflow = z.object({
  startPath: z.string().startsWith("/"),
  sessionExpired: z.object({ urlIncludes: z.string().min(1), loginStep: z.string().min(1) }),
  errorSelector: z.string().min(1),
  steps: z.array(WorkflowStep).min(1),
});
export type Workflow = z.infer<typeof Workflow>;

export const TermsReview = z.object({
  reviewedAt: z.string(),
  reviewer: z.string(),
  permitsUserDirectedAutomation: z.boolean(),
  notes: z.string(),
});

export const ServiceDefinition = z
  .object({
    slug: z.string().regex(/^[a-z][a-z0-9_]*$/),
    version: z.number().int().positive(),
    enabled: z.boolean(),
    portalKind: z.enum(["demo", "real"]),
    /** Shown on receipts. Defaults to the bundled demo portal's name; required for real portals. */
    portalName: Localized.optional(),
    name: Localized,
    summary: Localized,
    fields: z.array(FieldDef).min(1),
    requiredDocs: z.array(RequiredDoc),
    eligibility: z.object({ rules: z.array(EligibilityRule) }),
    workflow: Workflow,
    termsReview: TermsReview.optional(),
  })
  .superRefine((svc, ctx) => {
    const fieldKeys = new Set(svc.fields.map((f) => f.key));
    const docs = new Map(svc.requiredDocs.map((d) => [d.kind, new Set(d.extract.map((e) => e.key))]));
    if (fieldKeys.size !== svc.fields.length) {
      ctx.addIssue({ code: "custom", message: "duplicate field keys" });
    }
    for (const f of svc.fields) {
      if (f.type === "enum" && !f.options && !f.optionsRef) {
        ctx.addIssue({ code: "custom", message: `enum field ${f.key} needs options or optionsRef` });
      }
      for (const src of f.sources) {
        const [kind, key] = src.split(".") as [string, string];
        if (!docs.get(kind)?.has(key)) {
          ctx.addIssue({ code: "custom", message: `field ${f.key} source ${src} is not extracted by any document` });
        }
      }
    }
    const stepIds = new Set<string>();
    for (const step of svc.workflow.steps) {
      if (stepIds.has(step.id)) ctx.addIssue({ code: "custom", message: `duplicate step ${step.id}` });
      stepIds.add(step.id);
      for (const a of step.actions) {
        if ((a.do === "fill" || a.do === "select") && !fieldKeys.has(a.field)) {
          ctx.addIssue({ code: "custom", message: `step ${step.id} uses unknown field ${a.field}` });
        }
        if (a.do === "upload" && !docs.has(a.doc)) {
          ctx.addIssue({ code: "custom", message: `step ${step.id} uploads unknown document ${a.doc}` });
        }
      }
    }
    if (!stepIds.has(svc.workflow.sessionExpired.loginStep)) {
      ctx.addIssue({ code: "custom", message: "sessionExpired.loginStep must name a step" });
    }
    for (const rule of svc.eligibility.rules) {
      if (!fieldKeys.has(rule.field)) {
        ctx.addIssue({ code: "custom", message: `eligibility rule ${rule.id} uses unknown field ${rule.field}` });
      }
    }
    if (svc.portalKind === "real" && !svc.portalName) {
      ctx.addIssue({ code: "custom", message: "real portals need a portalName for receipts" });
    }
    if (svc.portalKind === "real" && !svc.termsReview?.permitsUserDirectedAutomation) {
      ctx.addIssue({
        code: "custom",
        message: "real portals need a recorded terms review that permits user-directed automation",
      });
    }
  });
export type ServiceDefinition = z.infer<typeof ServiceDefinition>;

/* ------------------------------------------------------------------ */
/* Profile and extraction                                              */
/* ------------------------------------------------------------------ */

export const ProfileEntry = z.object({
  value: z.string().max(500),
  /** "document:<uuid>" or "manual" */
  source: z.string().max(100),
  confirmed: z.boolean(),
  confirmedAt: z.string().nullable(),
});
export type ProfileEntry = z.infer<typeof ProfileEntry>;

export const Profile = z.record(z.string(), ProfileEntry);
export type Profile = z.infer<typeof Profile>;

export const Confidence = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof Confidence>;

/** Shape the model must return for one document. Kept free of length/number constraints on purpose. */
export const ExtractionOutput = z.object({
  document_kind_matches: z.boolean(),
  looks_like_sample: z.boolean(),
  contains_aadhaar: z.boolean(),
  fields: z.array(
    z.object({
      key: z.string(),
      value: z.string().nullable(),
      confidence: Confidence,
    }),
  ),
});
export type ExtractionOutput = z.infer<typeof ExtractionOutput>;

/** What we store (encrypted) on documents.extracted_enc */
export const StoredExtraction = z.object({
  method: z.enum(["ai", "none"]),
  model: z.string().nullable(),
  extractedAt: z.string(),
  documentKindMatches: z.boolean(),
  containsAadhaar: z.boolean(),
  fields: z.record(z.string(), z.object({ value: z.string().nullable(), confidence: Confidence })),
});
export type StoredExtraction = z.infer<typeof StoredExtraction>;

/* ------------------------------------------------------------------ */
/* Agent actions proposed by the model                                 */
/* ------------------------------------------------------------------ */

export const AGENT_ACTION_TYPES = [
  "goto",
  "click",
  "fill",
  "select",
  "check",
  "upload",
  "press",
  "wait",
  "request_human",
  "finish",
] as const;
export const AgentActionType = z.enum(AGENT_ACTION_TYPES);
export type AgentActionType = z.infer<typeof AgentActionType>;

/** Flat on purpose: simple JSON schema for structured output, validated again by validator.ts. */
export const ProposedAction = z.object({
  type: AgentActionType,
  ref: z.string().nullable(),
  field: z.string().nullable(),
  /** Preferred over `value`: a named presentation of the confirmed value (see VARIANT_FORMATS). */
  format: z.string().nullable(),
  value: z.string().nullable(),
  url: z.string().nullable(),
  key: z.string().nullable(),
  doc: z.string().nullable(),
  wait_ms: z.number().nullable(),
  reason: z.string(),
  suspicious_page_instructions: z.boolean(),
});
export type ProposedAction = z.infer<typeof ProposedAction>;

/* ------------------------------------------------------------------ */
/* Runs, approvals, consents                                           */
/* ------------------------------------------------------------------ */

export const RUN_STATUSES = [
  "QUEUED",
  "EXTRACTING",
  "NEEDS_PROFILE_CONFIRM",
  "PLANNING",
  "EXECUTING",
  "AWAITING_HUMAN",
  "AWAITING_FINAL_APPROVAL",
  "SUBMITTING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "PAUSED_EXPIRED",
] as const;
export const RunStatus = z.enum(RUN_STATUSES);
export type RunStatus = z.infer<typeof RunStatus>;

export const TERMINAL_STATUSES: readonly RunStatus[] = ["COMPLETED", "CANCELLED"];
export const ACTIVE_WORKER_STATUSES: readonly RunStatus[] = [
  "EXTRACTING",
  "PLANNING",
  "EXECUTING",
  "AWAITING_HUMAN",
  "AWAITING_FINAL_APPROVAL",
  "SUBMITTING",
];

/** Keep in sync with public.run_status_transition_ok() in supabase/migrations. */
const TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  QUEUED: ["EXTRACTING", "NEEDS_PROFILE_CONFIRM"],
  EXTRACTING: ["NEEDS_PROFILE_CONFIRM"],
  NEEDS_PROFILE_CONFIRM: ["PLANNING", "QUEUED"],
  PLANNING: ["EXECUTING", "NEEDS_PROFILE_CONFIRM"],
  EXECUTING: ["AWAITING_HUMAN", "AWAITING_FINAL_APPROVAL", "NEEDS_PROFILE_CONFIRM"],
  AWAITING_HUMAN: ["EXECUTING"],
  AWAITING_FINAL_APPROVAL: ["SUBMITTING", "NEEDS_PROFILE_CONFIRM"],
  SUBMITTING: ["COMPLETED"],
  COMPLETED: [],
  FAILED: ["PLANNING"],
  CANCELLED: [],
  PAUSED_EXPIRED: ["PLANNING"],
};

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  if (from === to) return true;
  if (TERMINAL_STATUSES.includes(from)) return false;
  if (to === "FAILED" || to === "CANCELLED" || to === "PAUSED_EXPIRED") return true;
  return TRANSITIONS[from].includes(to);
}

export const ApprovalKind = z.enum(["otp", "captcha", "final_submit"]);
export type ApprovalKind = z.infer<typeof ApprovalKind>;

export const ApprovalDecision = z.enum(["approved", "rejected", "provided", "expired"]);
export type ApprovalDecision = z.infer<typeof ApprovalDecision>;

export const CONSENT_PURPOSES = ["store_profile", "ai_processing", "agent_actions"] as const;
export const ConsentPurpose = z.enum(CONSENT_PURPOSES);
export type ConsentPurpose = z.infer<typeof ConsentPurpose>;

/** Bump when the consent notice text changes; stored with every grant/withdrawal. */
export const CONSENT_NOTICE_VERSION = "2026-11-01.1";

export const RunControl = z.enum(["none", "pause", "cancel"]);
export type RunControl = z.infer<typeof RunControl>;

/** One audit-log row as written by the worker. Values are always redacted before this point. */
export const RunStepRecord = z.object({
  action: z.string().max(40),
  target_label: z.string().max(200).nullable(),
  value_redacted: z.string().max(200).nullable(),
  result: z.enum(["ok", "error", "retry", "blocked", "info", "waiting"]),
  step_id: z.string().max(60).nullable(),
  message: z.string().max(500).nullable(),
});
export type RunStepRecord = z.infer<typeof RunStepRecord>;
