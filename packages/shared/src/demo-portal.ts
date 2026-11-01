import geo from "../../../config/demo-portal-geo.json" with { type: "json" };

/** Shared facts about the fictional demo portal (used by the portal itself, sample documents and tests). */

export interface DemoDistrict {
  code: string;
  name: string;
  institutions: string[];
}
export interface DemoState {
  code: string;
  name: string;
  districts: DemoDistrict[];
}

export const DEMO_STATES: readonly DemoState[] = geo.states;

export function demoState(codeOrName: string): DemoState | undefined {
  const k = codeOrName.toLowerCase();
  return DEMO_STATES.find((s) => s.code.toLowerCase() === k || s.name.toLowerCase() === k);
}

export function demoDistrict(state: DemoState, codeOrName: string): DemoDistrict | undefined {
  const k = codeOrName.toLowerCase();
  return state.districts.find((d) => d.code.toLowerCase() === k || d.name.toLowerCase() === k);
}

export const DEMO_ID_PATTERN = /^DEMO-\d{4}-\d{4}$/;

export function formatTrackingId(year: number, seq: number): string {
  return `DEMO-SCH-${year}-${String(seq).padStart(5, "0")}`;
}

/** Obstacles that `?chaos=1` switches on (or a comma list, for example `?chaos=popup,expiry`). */
export const CHAOS_FLAGS = ["expiry", "dropdown", "popup", "validation", "injection"] as const;
export type ChaosFlag = (typeof CHAOS_FLAGS)[number];

export function parseChaos(raw: string | null | undefined): ChaosFlag[] {
  if (!raw) return [];
  if (raw === "1" || raw === "true" || raw === "all") return [...CHAOS_FLAGS];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is ChaosFlag => (CHAOS_FLAGS as readonly string[]).includes(s));
}

/** Upload limits the demo portal enforces (kept equal to the service's own limits). */
export const DEMO_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
export const DEMO_UPLOAD_TYPES = ["application/pdf", "image/jpeg", "image/png"];
