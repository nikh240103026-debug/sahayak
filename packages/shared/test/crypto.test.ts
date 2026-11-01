import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  aad,
  decryptJSON,
  decryptString,
  encryptJSON,
  encryptString,
  needsReencrypt,
  portalHmac,
  type KeyRing,
} from "../src/crypto";
import { signWorkerRequest, verifyWorkerRequest } from "../src/hmac";

const ring = (version = 1, previous = new Map<number, Buffer>()): KeyRing => ({ version, key: randomBytes(32), previous });

describe("AES-256-GCM field encryption", () => {
  it("round-trips JSON and uses a fresh IV every time", () => {
    const r = ring();
    const a = encryptJSON({ name: "Ananya" }, aad.profile("u1"), r);
    const b = encryptJSON({ name: "Ananya" }, aad.profile("u1"), r);
    expect(a).not.toBe(b);
    expect(a.startsWith("enc:v1:")).toBe(true);
    expect(decryptJSON(a, aad.profile("u1"), r)).toEqual({ name: "Ananya" });
  });

  it("binds ciphertext to its row: a value copied to another user does not decrypt", () => {
    const r = ring();
    const token = encryptString("secret", aad.profile("user-a"), r);
    expect(() => decryptString(token, aad.profile("user-b"), r)).toThrow();
  });

  it("detects tampering", () => {
    const r = ring();
    const token = encryptString("secret", "ctx", r);
    const body = token.split(":")[2]!;
    const flipped = `${body.slice(0, -2)}${body.endsWith("A") ? "B" : "A"}${body.slice(-1)}`;
    expect(() => decryptString(`enc:v1:${flipped}`, "ctx", r)).toThrow();
  });

  it("supports key rotation through versioned ciphertexts", () => {
    const old = ring(1);
    const token = encryptString("kept", "ctx", old);
    const rotated: KeyRing = { version: 2, key: randomBytes(32), previous: new Map([[1, old.key]]) };
    expect(decryptString(token, "ctx", rotated)).toBe("kept");
    expect(needsReencrypt(token, rotated)).toBe(true);
    expect(needsReencrypt(encryptString("new", "ctx", rotated), rotated)).toBe(false);
    expect(() => decryptString(token, "ctx", ring(3))).toThrow(/no key/);
  });

  it("derives stable keyed hashes per purpose", () => {
    const r = ring();
    expect(portalHmac("mobile", "9876543210", r)).toBe(portalHmac("mobile", "9876543210", r));
    expect(portalHmac("mobile", "9876543210", r)).not.toBe(portalHmac("dob", "9876543210", r));
  });
});

describe("worker request signing", () => {
  const secret = "s".repeat(40);
  it("accepts a fresh, correct signature", () => {
    const body = JSON.stringify({ at: 1 });
    expect(verifyWorkerRequest(secret, signWorkerRequest(secret, body), body)).toBe(true);
  });
  it("rejects a wrong secret, a changed body and an old timestamp", () => {
    const body = "{}";
    const sig = signWorkerRequest(secret, body);
    expect(verifyWorkerRequest("x".repeat(40), sig, body)).toBe(false);
    expect(verifyWorkerRequest(secret, sig, '{"a":1}')).toBe(false);
    const old = signWorkerRequest(secret, body, Date.now() - 10 * 60_000);
    expect(verifyWorkerRequest(secret, old, body)).toBe(false);
    expect(verifyWorkerRequest(secret, null, body)).toBe(false);
  });
});
