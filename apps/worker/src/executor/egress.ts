import type { BrowserContext } from "playwright";
import { isUrlAllowed, type EgressAllowlist } from "@app/shared";

/**
 * Abort every request whose host/path is not on the allowlist. This is the
 * browser-level egress control; the action validator is the second layer.
 */
export async function attachEgressGuard(
  context: BrowserContext,
  allowlist: EgressAllowlist,
  onBlocked: (url: string) => void | Promise<void>,
): Promise<void> {
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (isUrlAllowed(url, allowlist)) return route.continue();
    try {
      await onBlocked(url);
    } catch {
      // logging must never let a blocked request through
    }
    return route.abort("blockedbyclient");
  });
}
