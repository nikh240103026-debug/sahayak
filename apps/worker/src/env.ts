import { WorkerEnv, parseEnv } from "@app/shared/env";
import { buildAllowlist, parseHostList, type EgressAllowlist } from "@app/shared";

let cached: WorkerEnv | null = null;

export function env(): WorkerEnv {
  cached ??= parseEnv(WorkerEnv, process.env);
  return cached;
}

export function egressAllowlist(e: WorkerEnv = env()): EgressAllowlist {
  return buildAllowlist({
    demoPortalBaseUrl: e.DEMO_PORTAL_BASE_URL,
    allowedPortalHosts: parseHostList(e.ALLOWED_PORTAL_HOSTS),
    enableRealPortals: e.ENABLE_REAL_PORTALS,
  });
}
