import { SetMetadata } from "@nestjs/common";

export const CREDIT_COST_KEY = "credit_cost";

export const CreditCost = (cost: number): MethodDecorator =>
  SetMetadata(CREDIT_COST_KEY, cost);
