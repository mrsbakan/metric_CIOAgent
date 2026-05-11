import { Injectable, NestMiddleware } from "@nestjs/common";
import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { requestStorage } from "../request-context.js";

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const trace_id =
      (req.headers["x-request-id"] as string | undefined) ?? randomUUID();

    requestStorage.run({ trace_id, tenant_context: null }, next);
  }
}
