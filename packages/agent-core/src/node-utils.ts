import type { AgentDeps, AgentGraphState } from "./types.js";

export function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function safeMarkFailed(deps: AgentDeps, state: AgentGraphState): Promise<void> {
  try {
    await deps.sessionRepo.updateSessionState(state.tenantId, state.sessionId, "FAILED");
  } catch {
    // best-effort — do not re-throw from error recovery path
  }
}
