import { describe, it, expect, jest, beforeAll } from "@jest/globals";
import { generateKeyPairSync } from "crypto";

// Generate a real RSA-2048 key pair for testing
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding:  { type: "spki",  format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

// Mock @cio-agent/vault/secrets before any import of jwt.ts
jest.mock("@cio-agent/vault/secrets", () => ({
  getJwtSecret: jest.fn(async () => ({
    private_key: privateKey,
    public_key:  publicKey,
  })),
}));

import { hashPassword, verifyPassword } from "../password.js";
import { signTokenPair, verifyAccessToken, verifyRefreshToken } from "../jwt.js";

const SAMPLE_PAYLOAD = {
  sub:       "user-uuid-123",
  tenant_id: "tenant-uuid-456",
  role_id:   "role-uuid-789",
  user_type: "standard" as const,
};

// ── password ─────────────────────────────────────────────────────────────────

describe("password", () => {
  it("hashes and verifies correct password", async () => {
    const hash = await hashPassword("S3cur3P@ss!");
    expect(hash).not.toBe("S3cur3P@ss!");
    await expect(verifyPassword("S3cur3P@ss!", hash)).resolves.toBe(true);
  });

  it("rejects wrong password", async () => {
    const hash = await hashPassword("correct-horse");
    await expect(verifyPassword("wrong-horse", hash)).resolves.toBe(false);
  });

  it("produces different hashes for the same input (salt)", async () => {
    const h1 = await hashPassword("same");
    const h2 = await hashPassword("same");
    expect(h1).not.toBe(h2);
  });
});

// ── JWT ───────────────────────────────────────────────────────────────────────

describe("jwt", () => {
  let access_token: string;
  let refresh_token: string;

  beforeAll(async () => {
    const pair = await signTokenPair(SAMPLE_PAYLOAD);
    access_token  = pair.access_token;
    refresh_token = pair.refresh_token;
  });

  it("signTokenPair returns non-empty tokens", async () => {
    expect(access_token.length).toBeGreaterThan(0);
    expect(refresh_token.length).toBeGreaterThan(0);
  });

  it("access token expires_in is 900s", async () => {
    const pair = await signTokenPair(SAMPLE_PAYLOAD);
    expect(pair.expires_in).toBe(900);
  });

  it("verifyAccessToken returns correct payload", async () => {
    const payload = await verifyAccessToken(access_token);
    expect(payload.sub).toBe(SAMPLE_PAYLOAD.sub);
    expect(payload.tenant_id).toBe(SAMPLE_PAYLOAD.tenant_id);
    expect(payload.role_id).toBe(SAMPLE_PAYLOAD.role_id);
    expect(payload.user_type).toBe(SAMPLE_PAYLOAD.user_type);
    expect(payload.jti).toBeTruthy();
  });

  it("verifyRefreshToken returns sub and tenant_id", async () => {
    const payload = await verifyRefreshToken(refresh_token);
    expect(payload.sub).toBe(SAMPLE_PAYLOAD.sub);
    expect(payload.tenant_id).toBe(SAMPLE_PAYLOAD.tenant_id);
    expect(payload.jti).toBeTruthy();
  });

  it("rejects tampered access token", async () => {
    const tampered = access_token.slice(0, -5) + "XXXXX";
    await expect(verifyAccessToken(tampered)).rejects.toThrow();
  });

  it("rejects wrong-key token", async () => {
    const { privateKey: otherKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding:  { type: "spki",  format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const jwt = await import("jsonwebtoken");
    const badToken = jwt.default.sign({ sub: "x" }, otherKey, { algorithm: "RS256" });
    await expect(verifyAccessToken(badToken)).rejects.toThrow();
  });

  it("access and refresh tokens have different jti", async () => {
    const ap = await verifyAccessToken(access_token);
    const rp = await verifyRefreshToken(refresh_token);
    expect(ap.jti).not.toBe(rp.jti);
  });
});
