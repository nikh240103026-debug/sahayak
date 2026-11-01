import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { ExtractionOutput, ProposedAction } from "@app/shared";
import type { z } from "zod";
import { log } from "../logger";
import { estimateCostUsd } from "./pricing";
import { AGENT_SYSTEM_PROMPT, EXTRACTION_SYSTEM_PROMPT, agentUserPrompt, extractionUserPrompt } from "./prompts";
import { LlmRefusalError, type ExtractInput, type LLMClient, type LLMResult, type ProposeInput } from "./types";

/** Server-side refusal fallbacks are available on these models (not on Haiku). */
function supportsServerFallback(model: string): boolean {
  return /^claude-(sonnet-5-5|opus-5|fable-5)/.test(model);
}

const PARSE_RETRIES = 2;

export class AnthropicLLMClient implements LLMClient {
  readonly enabled = true;
  readonly name = "anthropic";
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly agentModel: string,
    private readonly fastModel: string,
  ) {
    // The SDK retries 408/409/429/5xx and connection errors with exponential backoff.
    this.client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 3 });
  }

  private async call<S extends z.ZodType>(
    purpose: string,
    model: string,
    schema: S,
    system: string,
    content: BetaContentBlockParam[],
  ): Promise<LLMResult<z.infer<S>>> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= PARSE_RETRIES; attempt++) {
      const started = Date.now();
      try {
        const res = await this.client.beta.messages.parse({
          model,
          max_tokens: 8000,
          system,
          messages: [{ role: "user", content }],
          output_config: { effort: "low", format: betaZodOutputFormat(schema) },
          ...(supportsServerFallback(model)
            ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
            : {}),
        });
        const usage = {
          input: res.usage.input_tokens,
          output: res.usage.output_tokens,
          cacheRead: res.usage.cache_read_input_tokens ?? 0,
          cacheWrite: res.usage.cache_creation_input_tokens ?? 0,
        };
        const costUsd = estimateCostUsd(res.model, usage);
        log.info("llm call", { purpose, model: res.model, stop: res.stop_reason, ...usage, cost_usd: costUsd, ms: Date.now() - started });
        if (res.stop_reason === "refusal") throw new LlmRefusalError("The model declined this request");
        if (res.stop_reason === "max_tokens") throw new Error("model output was cut off");
        if (!res.parsed_output) throw new Error("model output did not match the schema");
        return {
          value: res.parsed_output as z.infer<S>,
          usage: { purpose, model: res.model, inputTokens: usage.input, outputTokens: usage.output, costUsd },
        };
      } catch (e) {
        lastError = e;
        if (e instanceof LlmRefusalError) throw e;
        if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.BadRequestError) throw e;
        if (e instanceof Anthropic.APIError && e.status !== undefined && e.status < 500 && e.status !== 429) throw e;
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      }
    }
    throw lastError instanceof Error ? lastError : new Error("model call failed");
  }

  async extractDocument(input: ExtractInput): Promise<LLMResult<ExtractionOutput>> {
    const content: BetaContentBlockParam[] = [];
    if (input.content.type === "image") {
      content.push({ type: "image", source: { type: "base64", media_type: input.content.mediaType, data: input.content.base64 } });
    } else if (input.content.type === "pdf") {
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: input.content.base64 } });
    } else {
      content.push({
        type: "text",
        text: `<document_text>\n${input.content.text.replace(/<\/?document_text>/gi, "")}\n</document_text>`,
      });
    }
    content.push({ type: "text", text: extractionUserPrompt(input) });
    return this.call("extract", this.fastModel, ExtractionOutput, EXTRACTION_SYSTEM_PROMPT, content);
  }

  async proposeAction(input: ProposeInput): Promise<LLMResult<ProposedAction>> {
    return this.call("propose", this.agentModel, ProposedAction, AGENT_SYSTEM_PROMPT, [
      { type: "text", text: agentUserPrompt(input) },
    ]);
  }
}
