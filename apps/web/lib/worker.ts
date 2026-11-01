import { WORKER_SIGNATURE_HEADER, signWorkerRequest } from "@app/shared/hmac";
import { env } from "@/lib/env";

/**
 * Nudge the worker (free hosts sleep when idle). Fire-and-forget: the run is
 * already in the database queue, so a failed wake only delays it until the
 * worker's next poll.
 */
export async function wakeWorker(): Promise<boolean> {
  const e = env();
  if (!e.WORKER_URL) return false;
  const body = JSON.stringify({ at: Date.now() });
  try {
    const res = await fetch(new URL("/wake", e.WORKER_URL), {
      method: "POST",
      headers: { "content-type": "application/json", [WORKER_SIGNATURE_HEADER]: signWorkerRequest(e.WORKER_SHARED_SECRET, body) },
      body,
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function workerHealth(): Promise<{ ok: boolean; detail?: unknown }> {
  const e = env();
  if (!e.WORKER_URL) return { ok: false, detail: "WORKER_URL is not set" };
  try {
    const res = await fetch(new URL("/health", e.WORKER_URL), { signal: AbortSignal.timeout(4000), cache: "no-store" });
    return { ok: res.ok, detail: await res.json().catch(() => null) };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}
