/**
 * Browser egress allowlist. Every request the agent's browser makes is checked
 * against this; anything else is aborted and logged.
 */

export interface EgressRule {
  /** host[:port], lower case */
  host: string;
  /** null = any path on this host */
  pathPrefixes: string[] | null;
}

export interface EgressAllowlist {
  rules: EgressRule[];
}

/** Paths the agent may load on the demo portal host. The rest of the web app (APIs, user pages) stays off limits. */
export const DEMO_PORTAL_PATHS = ["/demo-portal", "/_next/static/", "/favicon.ico"];

function hostOf(raw: string): string | null {
  try {
    const withScheme = raw.includes("://") ? raw : `https://${raw}`;
    return new URL(withScheme).host.toLowerCase();
  } catch {
    return null;
  }
}

export function buildAllowlist(opts: {
  demoPortalBaseUrl: string;
  allowedPortalHosts: string[];
  enableRealPortals: boolean;
}): EgressAllowlist {
  const demoHost = hostOf(opts.demoPortalBaseUrl);
  const rules: EgressRule[] = [];
  if (demoHost) rules.push({ host: demoHost, pathPrefixes: DEMO_PORTAL_PATHS });
  for (const h of opts.allowedPortalHosts) {
    const host = hostOf(h.trim());
    if (!host || host === demoHost) continue;
    // Hosts other than the demo portal are real portals; only allowed when explicitly enabled.
    if (opts.enableRealPortals) rules.push({ host, pathPrefixes: null });
  }
  return { rules };
}

/** Plain http is allowed only for local development hosts (including Docker's alias for the host machine). */
function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost") ||
    hostname === "host.docker.internal"
  );
}

export function isUrlAllowed(rawUrl: string, allowlist: EgressAllowlist): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol === "about:" || url.protocol === "data:" || url.protocol === "blob:") return true;
  if (url.username || url.password) return false;
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalHost(url.hostname))) return false;
  const host = url.host.toLowerCase();
  const rule = allowlist.rules.find((r) => r.host === host);
  if (!rule) return false;
  if (rule.pathPrefixes === null) return true;
  return rule.pathPrefixes.some(
    (p) => url.pathname === p || url.pathname.startsWith(p.endsWith("/") ? p : `${p}/`),
  );
}

export function parseHostList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
