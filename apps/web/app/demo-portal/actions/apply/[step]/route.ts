import { NextResponse } from "next/server";
import { sniffMime } from "@app/shared";
import { DEMO_UPLOAD_MAX_BYTES, DEMO_UPLOAD_TYPES } from "@app/shared/demo-portal";
import { sha256Hex } from "@app/shared/crypto";
import { SESSION_COOKIE, cookieOptions, expireSession, getSession, saveSession, type Upload } from "@/lib/demo-portal/session";
import { formRecord, validateStep } from "@/lib/demo-portal/forms";

const go = (req: Request, path: string) => NextResponse.redirect(new URL(path, req.url), 303);

export async function POST(req: Request, { params }: { params: Promise<{ step: string }> }) {
  const step = Number((await params).step);
  if (![1, 2, 3, 4, 5].includes(step)) return go(req, "/demo-portal/home");
  const s = await getSession();
  if (!s) return go(req, `/demo-portal/login?expired=1&next=/demo-portal/apply/${step}`);
  const fd = await req.formData();

  if (step === 5) {
    const errors: string[] = [];
    const uploads: Upload[] = [];
    for (const [field, kind, label] of [
      ["marksheet_file", "marksheet", "Upload Marksheet"],
      ["income_file", "income_certificate", "Upload Income Certificate"],
    ] as const) {
      const file = fd.get(field);
      if (!(file instanceof File) || file.size === 0) {
        errors.push(`${label}: Please choose a file.`);
        continue;
      }
      if (file.size > DEMO_UPLOAD_MAX_BYTES) {
        errors.push(`${label}: The file is larger than 2 MB.`);
        continue;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mime = sniffMime(bytes);
      if (!mime || !DEMO_UPLOAD_TYPES.includes(mime)) {
        errors.push(`${label}: Only PDF, JPG or PNG files are accepted.`);
        continue;
      }
      // The demo portal keeps only metadata, never the file itself.
      uploads.push({ kind, mime, size: file.size, sha256: sha256Hex(bytes) });
    }
    if (errors.length) {
      s.state.flash = { step, errors, values: {} };
    } else {
      s.state.draft[5] = { uploads };
      delete s.state.flash;
    }
    await saveSession(s);
    return go(req, errors.length ? "/demo-portal/apply/5" : "/demo-portal/apply/6");
  }

  const { errors, values } = validateStep(step as 1 | 2 | 3 | 4, formRecord(fd), s.state.chaos);
  if (errors.length) {
    s.state.flash = { step, errors, values };
    await saveSession(s);
    return go(req, `/demo-portal/apply/${step}`);
  }
  s.state.draft[step as 1] = values;
  delete s.state.flash;

  // Chaos: the session "times out" once, right after the first section is saved.
  if (step === 1 && s.state.chaos.includes("expiry") && !s.state.tripped.expiry) {
    s.state.tripped.expiry = true;
    await expireSession(s);
    const res = go(req, "/demo-portal/login?expired=1&next=/demo-portal/apply/2");
    res.cookies.set(SESSION_COOKIE, "", cookieOptions(0));
    return res;
  }
  await saveSession(s);
  return go(req, `/demo-portal/apply/${step + 1}`);
}
