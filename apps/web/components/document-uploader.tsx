"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { FileCheck2, Upload } from "lucide-react";
import { Button, Notice } from "./ui";

export interface UploaderDoc {
  kind: string;
  label: string;
  hint: string;
  accept: string;
  maxBytes: number;
  uploaded: { id: string; sizeKb: number } | null;
}

type UploadError = "tooBig" | "type" | "aadhaar" | "rate" | "consent" | "generic";

function DocRow({ doc, retentionHours }: { doc: UploaderDoc; retentionHours: number }) {
  const t = useTranslations("wizard");
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UploadError | null>(null);
  const [, startTransition] = useTransition();

  async function upload(file: File) {
    setError(null);
    if (file.size > doc.maxBytes) return setError("tooBig");
    setBusy(true);
    const body = new FormData();
    body.set("kind", doc.kind);
    body.set("file", file);
    try {
      const res = await fetch("/api/documents", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: UploadError };
      if (!json.ok) setError(json.error ?? "generic");
      else startTransition(() => router.refresh());
    } catch {
      setError("generic");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    if (!doc.uploaded) return;
    setBusy(true);
    await fetch(`/api/documents?id=${doc.uploaded.id}`, { method: "DELETE" }).catch(() => undefined);
    setBusy(false);
    startTransition(() => router.refresh());
  }

  return (
    <li className="space-y-3 rounded-xl border border-line bg-paper p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          {doc.uploaded ? (
            <FileCheck2 aria-hidden className="mt-0.5 size-6 shrink-0 text-success" />
          ) : (
            <Upload aria-hidden className="mt-0.5 size-6 shrink-0 text-muted" />
          )}
          <div>
            <p className="font-semibold">{doc.label}</p>
            <p id={`${id}-hint`} className="text-sm text-muted">
              {doc.hint}
            </p>
            {doc.uploaded && (
              <p className="text-sm text-success">
                {t("uploaded")} · {doc.uploaded.sizeKb} KB · {t("expiresNote", { hours: retentionHours })}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <input
            ref={input}
            id={id}
            type="file"
            accept={doc.accept}
            className="sr-only"
            aria-describedby={`${id}-hint`}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => input.current?.click()} aria-label={`${doc.uploaded ? t("replace") : t("chooseFile")}: ${doc.label}`}>
            {busy ? t("uploading") : doc.uploaded ? t("replace") : t("chooseFile")}
          </Button>
          {doc.uploaded && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={remove} aria-label={`${t("deleteFile")}: ${doc.label}`}>
              {t("deleteFile")}
            </Button>
          )}
        </div>
      </div>
      {error && (
        <Notice tone="danger" role="alert">
          {t(`uploadErrors.${error}`)}
        </Notice>
      )}
    </li>
  );
}

export function DocumentUploader({ docs, retentionHours }: { docs: UploaderDoc[]; retentionHours: number }) {
  return (
    <ul className="space-y-3">
      {docs.map((d) => (
        <DocRow key={d.kind} doc={d} retentionHours={retentionHours} />
      ))}
    </ul>
  );
}
