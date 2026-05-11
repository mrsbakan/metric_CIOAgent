import type { AgentGraphState, AgentDeps } from "../types.js";
import { enforceTransition } from "../state-machine.js";
import { toErrorMessage, safeMarkFailed } from "../node-utils.js";

// Placeholder: connector dispatch + idempotency enforcement is implemented in Steps 6–7.
export function makeExecuteNode(deps: AgentDeps) {
  return async (state: AgentGraphState): Promise<Partial<AgentGraphState>> => {
    const { sessionRepo, auditService } = deps;

    try {
      enforceTransition("EXECUTING", "COMPLETED");

      await sessionRepo.updateSessionState(state.tenantId, state.sessionId, "COMPLETED");

      await auditService.logStateTransition({
        tenantId:  state.tenantId,
        userId:    state.userId,
        sessionId: state.sessionId,
        fromState: "EXECUTING",
        toState:   "COMPLETED",
      });

      return { currentState: "COMPLETED" };
    } catch (err) {
      await safeMarkFailed(deps, state);
      return {
        currentState: "FAILED",
        error: toErrorMessage(err),
      };
    }
  };
}
