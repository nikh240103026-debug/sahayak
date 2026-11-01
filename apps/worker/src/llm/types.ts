import type { ExtractionOutput, PageSnapshot, ProposedAction } from "@app/shared";
import type { LlmUsageDelta } from "../store/types";

export type ExtractContent =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: "image/jpeg" | "image/png"; base64: string }
  | { type: "pdf"; base64: string };

export interface ExtractInput {
  docKind: string;
  docLabel: string;
  fields: Array<{ key: string; description: string }>;
  content: ExtractContent;
  /** Stable key for recorded fixtures (kind + content hash). */
  fixtureKey: string;
}

export interface FieldMapEntry {
  field: string;
  portalLabel: string;
  /** Format name -> value shape. Sensitive values are shown as shapes only (99/99/9999). */
  formats: Array<{ format: string; shape: string }>;
}

export interface ProposeInput {
  stepId: string;
  stepTitle: string;
  goal: string;
  problem: string;
  fieldMap: FieldMapEntry[];
  allowedClicks: string[];
  history: string[];
  snapshot: PageSnapshot;
  /** Stable key for recorded fixtures. */
  fixtureKey: string;
}

export interface LLMResult<T> {
  value: T;
  usage: LlmUsageDelta;
}

/** Provider-neutral interface. Anthropic is the default adapter. */
export interface LLMClient {
  readonly enabled: boolean;
  readonly name: string;
  extractDocument(input: ExtractInput): Promise<LLMResult<ExtractionOutput>>;
  proposeAction(input: ProposeInput): Promise<LLMResult<ProposedAction>>;
}

export class LlmDisabledError extends Error {
  constructor() {
    super("The AI assistant is switched off (LLM_DISABLED=true)");
  }
}

export class LlmRefusalError extends Error {}

export const disabledLlm: LLMClient = {
  enabled: false,
  name: "disabled",
  extractDocument: async () => {
    throw new LlmDisabledError();
  },
  proposeAction: async () => {
    throw new LlmDisabledError();
  },
};
