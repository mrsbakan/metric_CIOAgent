import type { AgentGraphState, AgentDeps } from "../types.js";
import { enforceTransition } from "../state-machine.js";
import { toErrorMessage } from "../node-utils.js";

export function makeReceiveNode(deps: AgentDeps) {
  return async (state: AgentGraphState): Promise<Partial<AgentGraphState>> => {
    const { sessionRepo, auditService } = deps;

    try {
      const existing = await sessionRepo.getActiveSessionForUser(state.tenantId, state.userId);
      if (existing) {
        return {
          currentState: "FAILED" as const,
          error: "CONCURRENT_SESSION: active session already in progress",
        };
      }

      enforceTransition("RECEIVED", "CONTEXT_LOADED");

      const session = await sessionRepo.createSession(state.tenantId, {
        user_id:    state.userId,
        role_id:    state.roleId,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      await sessionRepo.updateSessionState(state.tenantId, session.id, "CONTEXT_LOADED");

      await auditService.logStateTransition({
        tenantId:   state.tenantId,
        userId:     state.userId,
        sessionId:  session.id,
        fromState:  "RECEIVED",
        toState:    "CONTEXT_LOADED",
        ipAddress:  state.ipAddress,
      });

      return { sessionId: session.id, currentState: "CONTEXT_LOADED" as const };
    } catch (err) {
      return {
        currentState: "FAILED" as const,
        error: toErrorMessage(err),
      };
    }
  };
}
