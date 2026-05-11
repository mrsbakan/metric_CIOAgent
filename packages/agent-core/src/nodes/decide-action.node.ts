import type { AgentGraphState, AgentDeps } from "../types.js";
import { enforceTransition, requiresApproval } from "../state-machine.js";
import { toErrorMessage, safeMarkFailed } from "../node-utils.js";
import { evaluateAdm } from "../adm.js";

export function makeDecideActionNode(deps: AgentDeps) {
  return async (state: AgentGraphState): Promise<Partial<AgentGraphState>> => {
    const { sessionRepo, auditService } = deps;

    try {
      const decision = evaluateAdm(state.actionType, state.userType);
      const nextState = requiresApproval(decision) ? "AWAITING_APPROVAL" : "EXECUTING";

      enforceTransition("ACTION_DECIDED", nextState);

      await sessionRepo.updateSessionState(state.tenantId, state.sessionId, nextState);

      await auditService.logStateTransition({
        tenantId:  state.tenantId,
        userId:    state.userId,
        sessionId: state.sessionId,
        fromState: "ACTION_DECIDED",
        toState:   nextState,
      });

      return { currentState: nextState, actionDecision: decision };
    } catch (err) {
      await safeMarkFailed(deps, state);
      return { currentState: "FAILED", error: toErrorMessage(err) };
    }
  };
}
