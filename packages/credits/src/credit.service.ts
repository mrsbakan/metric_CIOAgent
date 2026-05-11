import type { Redis } from "ioredis";
import type { Db } from "@cio-agent/db";
import { creditLedger, getCreditBalance } from "@cio-agent/db";
import {
  deductCredits,
  getBalance as redisGetBalance,
  loadCredits,
} from "@cio-agent/redis/credits";
import { InsufficientCreditsError } from "@cio-agent/shared/errors";
import type { DeductParams, DeductResult, RefundParams } from "./types.js";

export class CreditService {
  constructor(
    private readonly db: Db,
    private readonly redis: Redis,
  ) {}

  async deduct(params: DeductParams): Promise<DeductResult> {
    const { tenantId, accountApplicationId, amount, actionType, referenceId } = params;

    const result = await deductCredits(tenantId, amount, this.redis);

    if (!result.ok) {
      const available = (await redisGetBalance(tenantId, this.redis)) ?? 0;
      throw new InsufficientCreditsError(available, amount);
    }

    await this.db.insert(creditLedger).values({
      tenant_id:              tenantId,
      account_application_id: accountApplicationId,
      amount,
      type:                   "debit",
      action_type:            actionType,
      reference_id:           referenceId,
    });

    return { remaining: result.remaining };
  }

  async refund(params: RefundParams): Promise<void> {
    const { tenantId, accountApplicationId, amount, actionType, referenceId } = params;

    await this.db.insert(creditLedger).values({
      tenant_id:              tenantId,
      account_application_id: accountApplicationId,
      amount,
      type:                   "credit",
      action_type:            actionType,
      reference_id:           referenceId,
    });

    await loadCredits(tenantId, amount, this.redis);
  }

  async getBalance(tenantId: string, accountApplicationId: string): Promise<number> {
    const cached = await redisGetBalance(tenantId, this.redis);
    if (cached !== null) return cached;

    const balance = await getCreditBalance(this.db, tenantId, accountApplicationId);
    await this.redis.set(`credit:${tenantId}:global`, balance);
    return balance;
  }
}
