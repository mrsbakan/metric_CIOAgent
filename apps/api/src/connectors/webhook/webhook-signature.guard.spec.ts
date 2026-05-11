import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { UnauthorizedException } from "@nestjs/common";
import { createHmac } from "crypto";
import type { ExecutionContext } from "@nestjs/common";

jest.mock("@cio-agent/vault/secrets", () => ({
  getConnectorSecret: jest.fn(),
}));

import { getConnectorSecret } from "@cio-agent/vault/secrets";

const mockGetConnectorSecret = getConnectorSecret as jest.MockedFunction<typeof getConnectorSecret>;

const WEBHOOK_SECRET = "super-secret-hmac-key";
const RAW_BODY       = Buffer.from(JSON.stringify({ webhookEvent: "jira:issue_created" }));
const VALID_SIG      = `sha256=${createHmac("sha256", WEBHOOK_SECRET).update(RAW_BODY).digest("hex")}`;

function makeContext(overrides: {
  tenantId?:    string | undefined;
  connectorId?: string | undefined;
  rawBody?:     Buffer | undefined;
  signature?:   string | undefined;
}): ExecutionContext {
  const req = {
    query: {
      ...(overrides.tenantId    !== undefined ? { tenant_id:    overrides.tenantId    } : {}),
      ...(overrides.connectorId !== undefined ? { connector_id: overrides.connectorId } : {}),
    },
    rawBody: overrides.rawBody,
    headers: {
      ...(overrides.signature !== undefined ? { "x-hub-signature-256": overrides.signature } : {}),
    },
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe("WebhookSignatureGuard", () => {
  let guard: import("./webhook-signature.guard.js").WebhookSignatureGuard;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockGetConnectorSecret.mockResolvedValue({
      auth_type:      "api_token",
      webhook_secret: WEBHOOK_SECRET,
    });
    const { WebhookSignatureGuard } = await import("./webhook-signature.guard.js");
    guard = new WebhookSignatureGuard();
  });

  it("allows request with valid HMAC signature", async () => {
    const ctx = makeContext({
      tenantId:    "t1",
      connectorId: "conn-1",
      rawBody:     RAW_BODY,
      signature:   VALID_SIG,
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it("throws UnauthorizedException when signature is invalid", async () => {
    const ctx = makeContext({
      tenantId:    "t1",
      connectorId: "conn-1",
      rawBody:     RAW_BODY,
      signature:   "sha256=badhash",
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it("throws UnauthorizedException when tenant_id is missing", async () => {
    const ctx = makeContext({
      connectorId: "conn-1",
      rawBody:     RAW_BODY,
      signature:   VALID_SIG,
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it("throws UnauthorizedException when connector_id is missing", async () => {
    const ctx = makeContext({
      tenantId:  "t1",
      rawBody:   RAW_BODY,
      signature: VALID_SIG,
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it("throws UnauthorizedException when raw body is missing", async () => {
    const ctx = makeContext({
      tenantId:    "t1",
      connectorId: "conn-1",
      signature:   VALID_SIG,
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it("throws UnauthorizedException when signature header is missing", async () => {
    const ctx = makeContext({
      tenantId:    "t1",
      connectorId: "conn-1",
      rawBody:     RAW_BODY,
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it("throws UnauthorizedException when webhook_secret not in Vault", async () => {
    mockGetConnectorSecret.mockResolvedValueOnce({ auth_type: "api_token" });
    const ctx = makeContext({
      tenantId:    "t1",
      connectorId: "conn-1",
      rawBody:     RAW_BODY,
      signature:   VALID_SIG,
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });
});
