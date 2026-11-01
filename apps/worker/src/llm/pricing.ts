/**
 * USD per million tokens, from Anthropic's published price list (checked 2026-11-01).
 * Used only for the per-run cost log; re-check before relying on it for billing.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};

export function estimateCostUsd(
  model: string,
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number },
): number | null {
  const p = PRICES[model];
  if (!p) return null;
  const inputCost = (usage.input + usage.cacheWrite * 1.25 + usage.cacheRead * 0.1) * p.input;
  return Number(((inputCost + usage.output * p.output) / 1_000_000).toFixed(6));
}
