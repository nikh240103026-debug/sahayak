import type { WorkerEnv } from "@app/shared/env";
import { AnthropicLLMClient } from "./anthropic";
import { GeminiLLMClient, geminiModel } from "./gemini";
import { RecordingLLMClient, ReplayLLMClient } from "./fixtures";
import { disabledLlm, type LLMClient } from "./types";

export function createLlmClient(env: WorkerEnv): LLMClient {
  if (env.LLM_DISABLED) return disabledLlm;
  if (env.LLM_FIXTURES === "replay") return new ReplayLLMClient(env.LLM_FIXTURES_DIR);
  let real: LLMClient;
  if (env.LLM_PROVIDER === "gemini") {
    if (!env.GEMINI_API_KEY) return disabledLlm;
    real = new GeminiLLMClient(env.GEMINI_API_KEY, geminiModel(env.LLM_MODEL_AGENT), geminiModel(env.LLM_MODEL_FAST));
  } else {
    if (!env.ANTHROPIC_API_KEY) return disabledLlm;
    real = new AnthropicLLMClient(env.ANTHROPIC_API_KEY, env.LLM_MODEL_AGENT, env.LLM_MODEL_FAST);
  }
  return env.LLM_FIXTURES === "record" ? new RecordingLLMClient(real, env.LLM_FIXTURES_DIR) : real;
}

export * from "./types";
