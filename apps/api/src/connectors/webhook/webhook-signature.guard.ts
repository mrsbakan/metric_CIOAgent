import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "crypto";
import type { Request } from "express";
import { getConnectorSecret } from "@cio-agent/vault/secrets";

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();

    const tenantId    = req.query["tenant_id"]    as string | undefined;
    const connectorId = req.query["connector_id"] as string | undefined;

    if (!tenantId || !connectorId) {
      throw new UnauthorizedException("Missing tenant_id or connector_id");
    }

    const rawBody = req.rawBody;
    if (!rawBody || rawBody.length === 0) {
      throw new UnauthorizedException("Missing request body");
    }

    const signatureHeader =
      (req.headers["x-hub-signature-256"] ?? req.headers["x-hub-signature"]) as string | undefined;

    if (!signatureHeader) {
      throw new UnauthorizedException("Missing signature header");
    }

    const secret = await getConnectorSecret(tenantId, "jira");
    if (!secret.webhook_secret) {
      throw new UnauthorizedException("Webhook secret not configured");
    }

    const expected = `sha256=${createHmac("sha256", secret.webhook_secret)
      .update(rawBody)
      .digest("hex")}`;

    const sigBuf  = Buffer.from(signatureHeader);
    const expBuf  = Buffer.from(expected);

    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new UnauthorizedException("Invalid webhook signature");
    }

    return true;
  }
}
