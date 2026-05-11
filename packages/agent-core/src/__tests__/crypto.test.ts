import { describe, it, expect } from "@jest/globals";
import { randomBytes } from "node:crypto";
import { encryptMemory, decryptMemory, parseEncryptionKey } from "../memory/crypto.js";

function makeKey(): Buffer {
  return randomBytes(32); // 256-bit AES key
}

// ─── encryptMemory / decryptMemory ────────────────────────────────────────────

describe("encryptMemory + decryptMemory", () => {
  it("round-trips plaintext correctly", () => {
    const key       = makeKey();
    const plaintext = "sprint context: velocity=42, board=PROJ";
    const cipher    = encryptMemory(plaintext, key);

    expect(decryptMemory(cipher, key)).toBe(plaintext);
  });

  it("round-trips an empty string", () => {
    const key  = makeKey();
    const cipher = encryptMemory("", key);
    expect(decryptMemory(cipher, key)).toBe("");
  });

  it("round-trips a unicode string", () => {
    const key  = makeKey();
    const text = "Görev: sprint özeti — 🚀";
    expect(decryptMemory(encryptMemory(text, key), key)).toBe(text);
  });

  it("produces different ciphertext on each call (unique IV)", () => {
    const key  = makeKey();
    const text = "same plaintext";
    const c1   = encryptMemory(text, key);
    const c2   = encryptMemory(text, key);

    expect(c1).not.toBe(c2);
  });

  it("ciphertext is a non-empty base64 string", () => {
    const cipher = encryptMemory("hello", makeKey());

    expect(typeof cipher).toBe("string");
    expect(cipher.length).toBeGreaterThan(0);
    expect(() => Buffer.from(cipher, "base64")).not.toThrow();
  });

  it("throws on tampered ciphertext (GCM auth tag mismatch)", () => {
    const key    = makeKey();
    const cipher = encryptMemory("sensitive data", key);
    const buf    = Buffer.from(cipher, "base64");
    // Flip a byte in the ciphertext payload (after IV + authTag)
    buf[30] = buf[30]! ^ 0xff;
    const tampered = buf.toString("base64");

    expect(() => decryptMemory(tampered, key)).toThrow();
  });

  it("throws when decrypting with the wrong key", () => {
    const key1   = makeKey();
    const key2   = makeKey();
    const cipher = encryptMemory("secret", key1);

    expect(() => decryptMemory(cipher, key2)).toThrow();
  });
});

// ─── parseEncryptionKey ───────────────────────────────────────────────────────

describe("parseEncryptionKey", () => {
  it("returns a 32-byte Buffer from a valid base64 key", () => {
    const raw    = randomBytes(32);
    const b64    = raw.toString("base64");
    const parsed = parseEncryptionKey(b64);

    expect(parsed).toBeInstanceOf(Buffer);
    expect(parsed.length).toBe(32);
    expect(parsed.equals(raw)).toBe(true);
  });

  it("throws if the decoded key is not 32 bytes", () => {
    const short = randomBytes(16).toString("base64"); // 128-bit — too short

    expect(() => parseEncryptionKey(short)).toThrow(/32 bytes/);
  });
});
