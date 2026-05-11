import {
  Injectable,
  Inject,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { Observable, from, throwError } from "rxjs";
import { switchMap, tap, catchError } from "rxjs/operators";
import type { TenantContext } from "@cio-agent/shared/types";
import { CreditService } from "@cio-agent/credits";
import { AuditService } from "@cio-agent/audit";
import { CREDIT_COST_KEY } from "../decorators/credit-cost.decorator.js";

type AuthedRequest = Request & { tenantContext: TenantContext };

@Injectable()
export class CreditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CreditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject("CREDIT_SERVICE") private readonly creditService: CreditService,
    @Inject("AUDIT_SERVICE")  private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const cost = this.reflector.getAllAndOverride<number | undefined>(CREDIT_COST_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (cost === undefined) return next.handle();

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const { tenant_id, user_id, account_application_id } = request.tenantContext;
    const actionType = `api.${request.method.toLowerCase()}.${(request.route as { path: string } | undefined)?.path ?? request.path}`;

    return from(
      this.creditService.deduct({
        tenantId:              tenant_id,
        accountApplicationId:  account_application_id,
        amount:                cost,
        actionType,
      }),
    ).pipe(
      switchMap(() => next.handle()),
      tap(() => {
        void this.auditService.logEvent({
          tenantId:   tenant_id,
          userId:     user_id,
          eventType:  "credit_consumed",
          action:     actionType,
          afterState: { cost },
        });
      }),
      catchError((err: unknown) => {
        if (
          err instanceof Error &&
          "code" in err &&
          (err as { code: string }).code === "INSUFFICIENT_CREDITS"
        ) {
          void this.auditService.logEvent({
            tenantId:  tenant_id,
            userId:    user_id,
            eventType: "credit_exhausted",
            action:    actionType,
          });

          return throwError(
            () =>
              new HttpException(
                {
                  error:   "INSUFFICIENT_CREDITS",
                  message: "Insufficient credits to perform this action",
                },
                HttpStatus.PAYMENT_REQUIRED,
              ),
          );
        }

        this.logger.error("CreditInterceptor unexpected error", err);
        return throwError(() => err);
      }),
    );
  }
}
