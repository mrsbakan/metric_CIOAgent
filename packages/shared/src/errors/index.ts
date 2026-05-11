export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class InsufficientCreditsError extends AppError {
  constructor(available: number, required: number) {
    super(
      "INSUFFICIENT_CREDITS",
      "Insufficient credits",
      `Available: ${available.toString()}, required: ${required.toString()}`,
    );
  }
}

export class ApprovalRequiredError extends AppError {
  constructor(actionType: string) {
    super(
      "APPROVAL_REQUIRED",
      "Action requires explicit approval",
      `Action type: ${actionType}`,
    );
  }
}

export class SessionIsolationError extends AppError {
  constructor() {
    super("SESSION_ISOLATION_VIOLATION", "Cross-session state access denied");
  }
}

export class TenantIsolationError extends AppError {
  constructor() {
    super("TENANT_ISOLATION_VIOLATION", "Cross-tenant data access denied");
  }
}

export class LicenseReadOnlyError extends AppError {
  constructor() {
    super(
      "LICENSE_READ_ONLY",
      "System is in read-only mode — license renewal required",
    );
  }
}

export class StateMachineError extends AppError {
  constructor(from: string, to: string) {
    super(
      "INVALID_STATE_TRANSITION",
      `Invalid state transition: ${from} → ${to}`,
    );
  }
}

export class PromptInjectionError extends AppError {
  constructor() {
    super("PROMPT_INJECTION_DETECTED", "Input rejected — suspicious pattern detected");
  }
}
