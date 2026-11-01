import { ExtractionOutput, ProposedAction } from "@app/shared";
import { z } from "zod";
import { log } from "../logger";
import {
  AGENT_SYSTEM_PROMPT,
  EXTRACTION_SYSTEM_PROMPT,
  agentUserPrompt,
  extractionUserPrompt,
} from "./prompts";
import {
  LlmRefusalError,
  type ExtractInput,
  type LLMClient,
  type LLMResult,
  type ProposeInput,
} from "./types";

/** Free-tier friendly default. Override with LLM_MODEL_AGENT / LLM_MODEL_FAST (for example gemini-2.5-flash-lite). */
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

/** A leftover Claude model name from the defaults is not a Gemini model, so fall back. */
export function geminiModel(configured: string): string {
  return /^gemini/i.test(configured) ? configured : DEFAULT_GEMINI_MODEL;
}

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

class GeminiHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_ATTEMPTS = 4;

/** Plain-fetch adapter for the Gemini API (no extra dependency). Free tier needs no billing account. */
export class GeminiLLMClient implements LLMClient {
  readonly enabled = true;
  readonly name = "gemini";

  constructor(
    private readonly apiKey: string,
    private readonly agentModel: string,
    private readonly fastModel: string,
    private readonly retryDelayMs = 1000,
  ) {}

  private async post(model: string, body: unknown): Promise<GeminiResponse> {
    const res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      let detail = "";
      try {
        detail = ((await res.json()) as { error?: { message?: string } }).error?.message ?? "";
      } catch {
        /* ignore */
      }
      throw new GeminiHttpError(
        res.status,
        `Gemini API error ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      );
    }
    return (await res.json()) as GeminiResponse;
  }

  /** Exposed for tests; callers use extractDocument and proposeAction. */
  async call<S extends z.ZodType>(
    purpose: string,
    model: string,
    schema: S,
    system: string,
    parts: Part[],
  ): Promise<LLMResult<z.infer<S>>> {
    const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
    delete jsonSchema.$schema;
    let useSchema = true;
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const started = Date.now();
      try {
        const res = await this.post(model, {
          systemInstruction: {
            parts: [{ text: `${system}\n\nReply with a single JSON object only.` }],
          },
          contents: [{ role: "user", parts }],
          generationConfig: {
            responseMimeType: "application/json",
            ...(useSchema ? { responseJsonSchema: jsonSchema } : {}),
            maxOutputTokens: 8192,
            temperature: 0,
          },
        });
        if (res.promptFeedback?.blockReason)
          throw new LlmRefusalError("The model declined this request");
        const cand = res.candidates?.[0];
        if (!cand) throw new Error("model returned no answer");
        if (cand.finishReason === "SAFETY" || cand.finishReason === "PROHIBITED_CONTENT") {
          throw new LlmRefusalError("The model declined this request");
        }
        if (cand.finishReason === "MAX_TOKENS") throw new Error("model output was cut off");
        const text = (cand.content?.parts ?? [])
          .map((p) => p.text ?? "")
          .join("")
          .trim();
        const parsed = schema.safeParse(JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")));
        if (!parsed.success) throw new Error("model output did not match the schema");
        const input = res.usageMetadata?.promptTokenCount ?? 0;
        const output = res.usageMetadata?.candidatesTokenCount ?? 0;
        log.info("llm call", {
          purpose,
          provider: "gemini",
          model,
          input,
          output,
          ms: Date.now() - started,
        });
        return {
          value: parsed.data as z.infer<S>,
          usage: { purpose, model, inputTokens: input, outputTokens: output, costUsd: 0 },
        };
      } catch (e) {
        lastError = e;
        if (e instanceof LlmRefusalError) throw e;
        if (e instanceof GeminiHttpError) {
          if (e.status === 401 || e.status === 403)
            throw new Error("Gemini rejected the API key (check GEMINI_API_KEY)");
          // Some schemas are too complex for the API: retry once without the schema (output is still validated here).
          if (e.status === 400 && useSchema) {
            useSchema = false;
            continue;
          }
          if (e.status !== 429 && e.status < 500) throw e;
        }
        await new Promise((r) => setTimeout(r, this.retryDelayMs * 2 ** attempt));
      }
    }
    throw lastError instanceof Error ? lastError : new Error("model call failed");
  }

  async extractDocument(input: ExtractInput): Promise<LLMResult<ExtractionOutput>> {
    const parts: Part[] = [];
    if (input.content.type === "image") {
      parts.push({ inlineData: { mimeType: input.content.mediaType, data: input.content.base64 } });
    } else if (input.content.type === "pdf") {
      parts.push({ inlineData: { mimeType: "application/pdf", data: input.content.base64 } });
    } else {
      parts.push({
        text: `<document_text>\n${input.content.text.replace(/<\/?document_text>/gi, "")}\n</document_text>`,
      });
    }
    parts.push({ text: extractionUserPrompt(input) });
    return this.call("extract", this.fastModel, ExtractionOutput, EXTRACTION_SYSTEM_PROMPT, parts);
  }

  async proposeAction(input: ProposeInput): Promise<LLMResult<ProposedAction>> {
    return this.call("propose", this.agentModel, ProposedAction, AGENT_SYSTEM_PROMPT, [
      { text: agentUserPrompt(input) },
    ]);
  }
}
