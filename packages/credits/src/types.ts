export interface DeductParams {
  tenantId: string;
  accountApplicationId: string;
  amount: number;
  actionType: string;
  referenceId?: string;
}

export interface RefundParams {
  tenantId: string;
  accountApplicationId: string;
  amount: number;
  actionType: string;
  referenceId?: string;
}

export interface DeductResult {
  remaining: number;
}
