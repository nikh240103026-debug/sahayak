import {
  containsAadhaar,
  maskAadhaar,
  redactText,
  type ExtractionOutput,
  type StoredExtraction,
} from "@app/shared";
import { sha256Hex } from "@app/shared/crypto";
import { pdfText } from "@app/shared/pdf";
import type { ExtractContent, LLMClient } from "./llm/types";
import { errorMessage, log } from "./logger";
import type { DocumentRecord, RunRecord, RunStore } from "./store/types";

/**
 * QUEUED -> EXTRACTING -> NEEDS_PROFILE_CONFIRM.
 * Reads the user's documents with the fast model (only with AI-processing consent),
 * masks any Aadhaar number before the model sees text and before storage, and
 * leaves every value unconfirmed for the user to check field by field.
 */
export async function runExtraction(store: RunStore, llm: LLMClient, run: RunRecord): Promise<void> {
  await store.setStatus(run.id, "EXTRACTING", { current_step: "extract", error: null });
  const service = await store.getService(run.service_slug);
  const docs = await store.getDocuments(run.user_id);
  const aiConsent = await store.latestConsent(run.user_id, "ai_processing");
  const useAi = !run.manual_entry && llm.enabled && aiConsent;

  const step = (message: string, result: "ok" | "info" | "error" | "blocked", label: string | null = null) =>
    store.appendStep(run, {
      step_id: "extract",
      action: "extract",
      target_label: label,
      value_redacted: null,
      result,
      message,
    });

  if (!useAi) {
    await step(
      !aiConsent || run.manual_entry
        ? "You chose to type your details yourself, so we did not send your documents to the AI model."
        : "Document reading is switched off right now, so please type your details yourself.",
      "info",
    );
  }

  for (const req of service.requiredDocs) {
    const doc = docs.find((d) => d.kind === req.kind);
    if (!doc) continue;
    if (!useAi) {
      if (doc.extraction_status === "pending") await store.saveExtraction(doc, null, "skipped");
      continue;
    }
    if (doc.extraction_status === "done") continue;
    try {
      const content = await documentContent(store, doc);
      if (content === "aadhaar") {
        await rejectAadhaar(store, doc);
        await step(
          `Your ${req.label.en.toLowerCase()} seems to show an Aadhaar number. We never process Aadhaar, so we deleted that file. Please upload a version without it.`,
          "blocked",
          req.label.en,
        );
        continue;
      }
      const { value, usage } = await llm.extractDocument({
        docKind: req.kind,
        docLabel: req.label.en,
        fields: req.extract,
        content,
        fixtureKey: `extract:${req.kind}:${sha256Hex(content.type === "text" ? content.text : content.base64).slice(0, 32)}`,
      });
      await store.addLlmUsage(run.id, usage);
      if (value.contains_aadhaar) {
        await rejectAadhaar(store, doc);
        await step(
          `Your ${req.label.en.toLowerCase()} seems to be or show an Aadhaar card. We never process Aadhaar, so we deleted that file.`,
          "blocked",
          req.label.en,
        );
        continue;
      }
      await store.saveExtraction(doc, toStored(value, req.extract.map((e) => e.key), usage.model), "done");
      await step(
        value.document_kind_matches
          ? `We read your ${req.label.en.toLowerCase()}. You will check every value next.`
          : `This file does not look like a ${req.label.en.toLowerCase()}. Please check the values carefully or upload the right file.`,
        value.document_kind_matches ? "ok" : "error",
        req.label.en,
      );
    } catch (e) {
      log.warn("extraction failed", { run: run.id, kind: req.kind, error: errorMessage(e) });
      await store.saveExtraction(doc, null, "failed");
      await step(`We could not read your ${req.label.en.toLowerCase()}. Please type those details yourself.`, "error", req.label.en);
    }
  }
  await store.setStatus(run.id, "NEEDS_PROFILE_CONFIRM", { current_step: null });
}

async function documentContent(store: RunStore, doc: DocumentRecord): Promise<ExtractContent | "aadhaar"> {
  const bytes = await store.downloadDocument(doc);
  if (doc.mime === "application/pdf") {
    const text = await pdfText(bytes).catch(() => "");
    if (text.length >= 40) {
      // Mask before the model sees anything. A text-layer Aadhaar is rejected at upload; this is a second line.
      if (containsAadhaar(text)) return "aadhaar";
      return { type: "text", text: maskAadhaar(text).slice(0, 20000) };
    }
    return { type: "pdf", base64: bytes.toString("base64") };
  }
  return { type: "image", mediaType: doc.mime, base64: bytes.toString("base64") };
}

async function rejectAadhaar(store: RunStore, doc: DocumentRecord) {
  await store.removeDocumentFile(doc);
  await store.saveExtraction(doc, null, "rejected");
}

function toStored(value: ExtractionOutput, allowedKeys: string[], model: string): StoredExtraction {
  const fields: StoredExtraction["fields"] = {};
  for (const key of allowedKeys) {
    const hit = value.fields.find((f) => f.key === key);
    fields[key] = {
      value: hit?.value ? redactAadhaarOnly(hit.value).slice(0, 300) : null,
      confidence: hit?.confidence ?? "low",
    };
  }
  return {
    method: "ai",
    model,
    extractedAt: new Date().toISOString(),
    documentKindMatches: value.document_kind_matches,
    containsAadhaar: false,
    fields,
  };
}

/** Values are stored encrypted, so only Aadhaar needs masking here (other PII is the user's own data). */
function redactAadhaarOnly(v: string): string {
  return containsAadhaar(v) ? redactText(v) : v;
}
