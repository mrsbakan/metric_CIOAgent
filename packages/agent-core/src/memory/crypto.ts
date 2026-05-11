import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM: authenticated encryption — provides both confidentiality and integrity.
// Each encrypt call generates a unique 12-byte IV. Output format (base64):
//   [ IV(12) | authTag(16) | ciphertext(n) ]
const ALGORITHM  = "aes-256-gcm";
const IV_BYTES   = 12;  // 96-bit IV — GCM recommended
const TAG_BYTES  = 16;  // 128-bit auth tag

export function encryptMemory(plaintext: string, keyBuffer: Buffer): string {
  const iv     = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, keyBuffer, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Encode as single base64 blob: IV + authTag + ciphertext
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptMemory(ciphertext: string, keyBuffer: Buffer): string {
  const buf      = Buffer.from(ciphertext, "base64");
  const iv       = buf.subarray(0, IV_BYTES);
  const authTag  = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const payload  = buf.subarray(IV_BYTES + TAG_BYTES);

  const decipher = createDecipheriv(ALGORITHM, keyBuffer, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(payload),
    decipher.final(),
  ]).toString("utf8");
}

/** Parses a base64-encoded 32-byte key string into a Buffer. */
export function parseEncryptionKey(base64Key: string): Buffer {
  const buf = Buffer.from(base64Key, "base64");
  if (buf.length !== 32) {
    throw new Error(`Invalid AES-256 key length: expected 32 bytes, got ${buf.length}`);
  }
  return buf;
}
