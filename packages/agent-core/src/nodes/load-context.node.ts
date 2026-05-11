import type { AgentGraphState, AgentDeps } from "../types.js";
import { enforceTransition } from "../state-machine.js";
import { toErrorMessage, safeMarkFailed } from "../node-utils.js";

export function makeLoadContextNode(deps: AgentDeps) {
  return async (state: AgentGraphState): Promise<Partial<AgentGraphState>> => {
    const { sessionRepo, auditService, memoryService } = deps;

    try {
      enforceTransition("CONTEXT_LOADED", "PROMPT_COMPILED");

      // Load session from DB — verifies existence and tenant/user isolation
      const session = await sessionRepo.getSessionById(state.tenantId, state.sessionId);

      if (!session) {
        // RLS would have filtered a cross-tenant read — this catches a genuinely missing session
        throw new Error("SESSION_NOT_FOUND");
      }

      // Defense-in-depth: explicit mismatch checks even though RLS enforces tenant scope at DB level
      if (session.tenant_id !== state.tenantId) {
        throw new Error("SESSION_TENANT_MISMATCH");
      }
      if (session.user_id !== state.userId) {
        throw new Error("SESSION_USER_MISMATCH");
      }

      // Load encrypted memories — decrypted at application layer, never stored in plaintext in DB
      const [userMemory, roleMemory] = await Promise.all([
        memoryService.loadAllUserMemory(state.tenantId, state.userId),
        memoryService.loadAllRoleMemory(state.tenantId, state.roleId),
      ]);

      const context: Record<string, unknown> = {
        ...(session.context as Record<string, unknown>),
        userMemory,
        roleMemory,
      };

      await sessionRepo.updateSessionState(state.tenantId, state.sessionId, "PROMPT_COMPILED", context);

      await auditService.logStateTransition({
        tenantId:  state.tenantId,
        userId:    state.userId,
        sessionId: state.sessionId,
        fromState: "CONTEXT_LOADED",
        toState:   "PROMPT_COMPILED",
      });

      return { currentState: "PROMPT_COMPILED", context };
    } catch (err) {
      await safeMarkFailed(deps, state);
      return { currentState: "FAILED", error: toErrorMessage(err) };
    }
  };
}
