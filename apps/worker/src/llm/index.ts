import type { WorkerEnv } from "@app/shared/env";
import { AnthropicLLMClient } from "./anthropic";
import { RecordingLLMClient, ReplayLLMClient } from "./fixtures";
import { disabledLlm, type LLMClient } from "./types";

export function createLlmClient(env: WorkerEnv): LLMClient {
  if (env.LLM_DISABLED) return disabledLlm;
  if (env.LLM_FIXTURES === "replay") return new ReplayLLMClient(env.LLM_FIXTURES_DIR);
  if (!env.ANTHROPIC_API_KEY) return disabledLlm;
  const real = new AnthropicLLMClient(env.ANTHROPIC_API_KEY, env.LLM_MODEL_AGENT, env.LLM_MODEL_FAST);
  return env.LLM_FIXTURES === "record" ? new RecordingLLMClient(real, env.LLM_FIXTURES_DIR) : real;
}

export * from "./types";
