import type { AgentGraphState, AgentDeps } from "../types.js";
import { enforceTransition } from "../state-machine.js";
import { toErrorMessage, safeMarkFailed } from "../node-utils.js";

// Placeholder: actual LLM invocation (with retry + 30s timeout) is implemented in Step 3.
export function makeCallLlmNode(deps: AgentDeps) {
  return async (state: AgentGraphState): Promise<Partial<AgentGraphState>> => {
    const { sessionRepo, auditService } = deps;

    try {
      enforceTransition("LLM_CALLED", "ACTION_DECIDED");

      await sessionRepo.updateSessionState(state.tenantId, state.sessionId, "ACTION_DECIDED");

      await auditService.logStateTransition({
        tenantId:  state.tenantId,
        userId:    state.userId,
        sessionId: state.sessionId,
        fromState: "LLM_CALLED",
        toState:   "ACTION_DECIDED",
      });

      return {
        currentState:    "ACTION_DECIDED",
        llmResponseText: "[PLACEHOLDER: LLM response will be wired in Step 3]",
      };
    } catch (err) {
      await safeMarkFailed(deps, state);
      return {
        currentState: "FAILED",
        error: toErrorMessage(err),
      };
    }
  };
}
