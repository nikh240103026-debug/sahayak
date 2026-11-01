import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  ExtractionOutput,
  ProposedAction,
  normalizeLabel,
  type PageSnapshot,
} from "@app/shared";
import type { ExtractInput, LLMClient, LLMResult, ProposeInput } from "./types";

/**
 * Recorded model responses for CI and offline e2e runs.
 *
 * Proposals are stored with `target_name` (the element's accessible name)
 * instead of the per-page `ref`, so a fixture survives harmless markup changes.
 * A key can hold a list of responses; the n-th call for that key gets the n-th
 * entry (the last one repeats).
 */

type StoredProposal = Omit<ProposedAction, "ref"> & { target_name: string | null };
type FixtureFile = Record<string, StoredProposal[] | ExtractionOutput>;

export function situationKey(snapshot: PageSnapshot, problemKind: string): string {
  if (snapshot.dialogs.length) return "dialog";
  const first = snapshot.alerts[0]?.replace(/^(please )?(correct|fix) the following:?\s*/i, "");
  if (first) {
    return `alert:${normalizeLabel(first)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60)}`;
  }
  return `problem:${problemKind}`;
}

function loadAll(dir: string): FixtureFile {
  const merged: FixtureFile = {};
  if (!existsSync(dir)) return merged;
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
    Object.assign(merged, JSON.parse(readFileSync(join(dir, f), "utf8")) as FixtureFile);
  }
  return merged;
}

function resolveRef(snapshot: PageSnapshot, name: string | null): string | null {
  if (!name) return null;
  const want = normalizeLabel(name);
  const el =
    snapshot.elements.find((e) => normalizeLabel(e.name) === want) ??
    snapshot.elements.find((e) => normalizeLabel(e.name).startsWith(want));
  return el?.ref ?? null;
}

const zeroUsage = (purpose: string) => ({ purpose, model: "fixture", inputTokens: 0, outputTokens: 0, costUsd: 0 });

export class ReplayLLMClient implements LLMClient {
  readonly enabled = true;
  readonly name = "fixture-replay";
  private readonly fixtures: FixtureFile;
  private readonly calls = new Map<string, number>();

  constructor(dir: string) {
    this.fixtures = loadAll(dir);
  }

  async extractDocument(input: ExtractInput): Promise<LLMResult<ExtractionOutput>> {
    const hit = this.fixtures[input.fixtureKey];
    if (!hit || Array.isArray(hit)) throw new Error(`no recorded fixture for ${input.fixtureKey}`);
    return { value: ExtractionOutput.parse(hit), usage: zeroUsage("extract") };
  }

  async proposeAction(input: ProposeInput): Promise<LLMResult<ProposedAction>> {
    const list = this.fixtures[input.fixtureKey];
    if (!Array.isArray(list) || list.length === 0) {
      // Unknown situation: behave like a careful model and hand over to the human.
      return {
        value: {
          type: "request_human",
          ref: null,
          field: null,
          format: null,
          value: null,
          url: null,
          key: null,
          doc: null,
          wait_ms: null,
          reason: `No recorded response for ${input.fixtureKey}`,
          suspicious_page_instructions: false,
        },
        usage: zeroUsage("propose"),
      };
    }
    const n = this.calls.get(input.fixtureKey) ?? 0;
    this.calls.set(input.fixtureKey, n + 1);
    const stored = list[Math.min(n, list.length - 1)]!;
    const { target_name, ...rest } = stored;
    return {
      value: ProposedAction.parse({ ...rest, ref: resolveRef(input.snapshot, target_name) }),
      usage: zeroUsage("propose"),
    };
  }
}

/** Wraps a real client and appends every response to <dir>/recorded.json. */
export class RecordingLLMClient implements LLMClient {
  readonly enabled = true;
  readonly name: string;
  private readonly file: string;

  constructor(
    private readonly inner: LLMClient,
    dir: string,
  ) {
    this.name = `${inner.name}+record`;
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, "recorded.json");
  }

  private append(key: string, value: StoredProposal | ExtractionOutput, list: boolean) {
    const data: FixtureFile = existsSync(this.file) ? (JSON.parse(readFileSync(this.file, "utf8")) as FixtureFile) : {};
    if (list) {
      const existing = Array.isArray(data[key]) ? (data[key] as StoredProposal[]) : [];
      data[key] = [...existing, value as StoredProposal];
    } else {
      data[key] = value as ExtractionOutput;
    }
    writeFileSync(this.file, `${JSON.stringify(data, null, 2)}\n`);
  }

  async extractDocument(input: ExtractInput): Promise<LLMResult<ExtractionOutput>> {
    const res = await this.inner.extractDocument(input);
    this.append(input.fixtureKey, res.value, false);
    return res;
  }

  async proposeAction(input: ProposeInput): Promise<LLMResult<ProposedAction>> {
    const res = await this.inner.proposeAction(input);
    const { ref, ...rest } = res.value;
    const target_name = ref ? (input.snapshot.elements.find((e) => e.ref === ref)?.name ?? null) : null;
    this.append(input.fixtureKey, { ...rest, target_name }, true);
    return res;
  }
}
