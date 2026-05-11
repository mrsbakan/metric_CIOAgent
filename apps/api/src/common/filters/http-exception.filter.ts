import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type { ApiError } from "@cio-agent/shared/types";
import { getTraceId } from "../request-context.js";

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx      = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request  = ctx.getRequest<Request>();
    const trace_id = getTraceId();

    let status  = HttpStatus.INTERNAL_SERVER_ERROR;
    let code    = "INTERNAL_ERROR";
    let message = "An unexpected error occurred";
    let detail: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === "string") {
        message = body;
      } else if (typeof body === "object" && body !== null) {
        const b = body as Record<string, unknown>;
        message = (b["message"] as string | undefined) ?? exception.message;
        code    = (b["error"] as string | undefined)?.toUpperCase().replace(/\s+/g, "_") ?? `HTTP_${status}`;
        detail  = b["detail"] as string | undefined;
      }
      code = code || `HTTP_${status}`;
    } else if (exception instanceof Error) {
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception.stack,
        { trace_id },
      );
    }

    const body: ApiError = {
      error: { code, message, trace_id, ...(detail !== undefined && { detail }) },
    };

    response.status(status).json(body);
  }
}
