import { WebEnv, parseEnv } from "@app/shared/env";

export { publicEnv } from "./public-env";

let cached: WebEnv | null = null;

/** Server-side environment, validated on first use. Never import this from a client component. */
export function env(): WebEnv {
  cached ??= parseEnv(WebEnv, process.env);
  return cached;
}
