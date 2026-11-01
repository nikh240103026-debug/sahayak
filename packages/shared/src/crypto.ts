import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * Application-level encryption for profile and extracted-document fields.
 * AES-256-GCM, random 96-bit IV per value, additional authenticated data binds
 * each ciphertext to its row (so a value cannot be copied into another user's row).
 *
 * Token format: enc:v<version>:<base64url(iv | tag | ciphertext)>
 * The version prefix lets you rotate keys: set the new key as ENCRYPTION_KEY with
 * a higher ENCRYPTION_KEY_VERSION and list old keys in ENCRYPTION_PREVIOUS_KEYS.
 */

export interface KeyRing {
  version: number;
  key: Buffer;
  previous: Map<number, Buffer>;
}

const IV_BYTES = 12;
const TAG_BYTES = 16;

function decodeKey(b64: string, name: string): Buffer {
  const key = Buffer.from(b64.trim(), "base64");
  if (key.length !== 32) {
    throw new Error(`${name} must be 32 random bytes, base64 encoded (run: npm run keygen)`);
  }
  return key;
}

export function loadKeyRing(env: NodeJS.ProcessEnv = process.env): KeyRing {
  const raw = env.ENCRYPTION_KEY;
  console.log(
    "[ENV DEBUG] crypto.ts ENCRYPTION_KEY:",
    raw ? "FOUND" : "MISSING"
  );
  if (!raw) throw new Error("ENCRYPTION_KEY is not set (run: npm run keygen)");
  const version = Number(env.ENCRYPTION_KEY_VERSION || "1");
  if (!Number.isInteger(version) || version < 1) throw new Error("ENCRYPTION_KEY_VERSION must be a positive integer");
  const previous = new Map<number, Buffer>();
  for (const part of (env.ENCRYPTION_PREVIOUS_KEYS ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const idx = part.indexOf(":");
    const v = Number(part.slice(0, idx));
    if (idx < 1 || !Number.isInteger(v)) throw new Error("ENCRYPTION_PREVIOUS_KEYS entries look like 1:<base64>");
    previous.set(v, decodeKey(part.slice(idx + 1), `ENCRYPTION_PREVIOUS_KEYS[${v}]`));
  }
  return { version, key: decodeKey(raw, "ENCRYPTION_KEY"), previous };
}

let cached: KeyRing | null = null;
function ring(): KeyRing {
  cached ??= loadKeyRing();
  return cached;
}

/** For tests: use a specific key ring instead of the environment. */
export function setKeyRingForTesting(r: KeyRing | null): void {
  cached = r;
}

export function encryptString(plain: string, aad: string, keyRing: KeyRing = ring()): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keyRing.key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v${keyRing.version}:${Buffer.concat([iv, tag, ct]).toString("base64url")}`;
}

export function decryptString(token: string, aad: string, keyRing: KeyRing = ring()): string {
  const m = /^enc:v(\d+):([A-Za-z0-9_-]+)$/.exec(token);
  if (!m) throw new Error("not an encrypted value");
  const version = Number(m[1]);
  const key = version === keyRing.version ? keyRing.key : keyRing.previous.get(version);
  if (!key) throw new Error(`no key for ciphertext version ${version}`);
  const buf = Buffer.from(m[2]!, "base64url");
  if (buf.length < IV_BYTES + TAG_BYTES) throw new Error("ciphertext too short");
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ct = buf.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

export function encryptJSON(value: unknown, aad: string, keyRing?: KeyRing): string {
  return encryptString(JSON.stringify(value), aad, keyRing);
}

export function decryptJSON<T = unknown>(token: string, aad: string, keyRing?: KeyRing): T {
  return JSON.parse(decryptString(token, aad, keyRing)) as T;
}

/** True when the token was written with an older key and should be re-encrypted. */
export function needsReencrypt(token: string, keyRing: KeyRing = ring()): boolean {
  const m = /^enc:v(\d+):/.exec(token);
  return !m || Number(m[1]) !== keyRing.version;
}

/** AAD helpers: one place that defines how ciphertexts are bound to rows. */
export const aad = {
  profile: (userId: string) => `profiles_private:${userId}`,
  extraction: (userId: string, documentId: string) => `documents:${userId}:${documentId}`,
  approvalResponse: (runId: string, approvalId: string) => `approvals:${runId}:${approvalId}`,
  demoPortal: (sessionId: string) => `demo_portal:${sessionId}`,
};

export function sha256Hex(data: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Purpose-specific subkey derived from the current key (HKDF-SHA256). */
export function deriveKey(info: string, keyRing: KeyRing = ring()): Buffer {
  return Buffer.from(hkdfSync("sha256", keyRing.key, Buffer.alloc(0), info, 32));
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Keyed hash used by the demo portal for identifiers it must look up but never store in clear. */
export function portalHmac(purpose: string, value: string, keyRing?: KeyRing): string {
  return createHmac("sha256", deriveKey(`demo-portal:${purpose}`, keyRing)).update(value).digest("hex");
}
