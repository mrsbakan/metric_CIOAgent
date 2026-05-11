import type { AgentGraphState, AgentDeps } from "../types.js";
import { enforceTransition } from "../state-machine.js";
import { toErrorMessage, safeMarkFailed } from "../node-utils.js";

export function makeCompilePromptNode(deps: AgentDeps) {
  return async (state: AgentGraphState): Promise<Partial<AgentGraphState>> => {
    const { sessionRepo, auditService, promptCompiler } = deps;

    try {
      enforceTransition("PROMPT_COMPILED", "LLM_CALLED");

      const result = await promptCompiler.compile({
        tenantId:  state.tenantId,
        sessionId: state.sessionId,
        userId:    state.userId,
        roleId:    state.roleId,
      });

      for (const conflict of result.conflicts) {
        void auditService.logEvent({
          tenantId:   state.tenantId,
          sessionId:  state.sessionId,
          userId:     state.userId,
          eventType:  "PROMPT_CONFLICT_DETECTED",
          entityType: "prompt_layer",
          afterState: { layer: conflict.layer, pattern: conflict.pattern },
        }).catch(() => undefined);
      }

      if (result.trimmed) {
        void auditService.logEvent({
          tenantId:   state.tenantId,
          sessionId:  state.sessionId,
          userId:     state.userId,
          eventType:  "prompt_token_budget_trimmed",
          entityType: "prompt_layer",
          afterState: { tokenCount: result.tokenCount, layersIncluded: result.layersIncluded },
        }).catch(() => undefined);
      }

      await sessionRepo.updateSessionState(state.tenantId, state.sessionId, "LLM_CALLED");

      await auditService.logStateTransition({
        tenantId:  state.tenantId,
        userId:    state.userId,
        sessionId: state.sessionId,
        fromState: "PROMPT_COMPILED",
        toState:   "LLM_CALLED",
      });

      return { currentState: "LLM_CALLED", compiledPrompt: result.compiledPrompt };
    } catch (err) {
      await safeMarkFailed(deps, state);
      return { currentState: "FAILED", error: toErrorMessage(err) };
    }
  };
}
