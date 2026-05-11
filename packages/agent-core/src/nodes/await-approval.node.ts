import type { AgentGraphState, AgentDeps } from "../types.js";
import { enforceTransition } from "../state-machine.js";
import { toErrorMessage, safeMarkFailed } from "../node-utils.js";

const APPROVAL_TIMEOUT_MS = 48 * 60 * 60 * 1_000; // 48 hours

function isExpired(requestedAt: Date): boolean {
  return Date.now() - requestedAt.getTime() > APPROVAL_TIMEOUT_MS;
}

export function makeAwaitApprovalNode(deps: AgentDeps) {
  return async (state: AgentGraphState): Promise<Partial<AgentGraphState>> => {
    const { sessionRepo, auditService, acquireApprovalLock } = deps;

    try {
      // ── Resume path: approval was already created in a prior invocation ──
      if (state.approvalId) {
        const approval = await sessionRepo.getPendingApproval(
          state.tenantId,
          state.approvalId,
        );

        if (!approval) {
          await safeMarkFailed(deps, state);
          return { currentState: "FAILED", error: "APPROVAL_RECORD_NOT_FOUND" };
        }

        if (approval.status === "approved") {
          enforceTransition("AWAITING_APPROVAL", "EXECUTING");
          await sessionRepo.updateSessionState(state.tenantId, state.sessionId, "EXECUTING");
          await auditService.logStateTransition({
            tenantId:  state.tenantId,
            userId:    state.userId,
            sessionId: state.sessionId,
            fromState: "AWAITING_APPROVAL",
            toState:   "EXECUTING",
          });
          return { currentState: "EXECUTING" };
        }

        if (approval.status === "rejected") {
          await safeMarkFailed(deps, state);
          return { currentState: "FAILED", error: "APPROVAL_REJECTED" };
        }

        // still pending — check 48h timeout
        if (isExpired(approval.requested_at)) {
          await safeMarkFailed(deps, state);
          return { currentState: "FAILED", error: "APPROVAL_TIMEOUT" };
        }

        // still pending and not expired — stay suspended
        return { currentState: "AWAITING_APPROVAL" };
      }

      // ── Fresh path: first time entering this node ──
      const lock = await acquireApprovalLock(state.sessionId);
      if (!lock) {
        await safeMarkFailed(deps, state);
        return { currentState: "FAILED", error: "DUPLICATE_APPROVAL_REQUEST" };
      }

      let approvalId: string;
      try {
        const approval = await sessionRepo.createPendingApproval(state.tenantId, {
          session_id:  state.sessionId,
          action_type: state.actionType || "unknown",
          payload:     state.actionPayload,
        });
        approvalId = approval.id;
      } finally {
        await lock.release();
      }

      void auditService.logEvent({
        tenantId:   state.tenantId,
        sessionId:  state.sessionId,
        userId:     state.userId,
        eventType:  "approval_requested",
        entityType: "pending_approval",
        afterState: { approvalId, actionType: state.actionType, actionDecision: state.actionDecision },
      }).catch(() => undefined);

      await sessionRepo.updateSessionState(state.tenantId, state.sessionId, "AWAITING_APPROVAL");

      // Graph suspends here — human must approve/reject via API before resuming
      return { currentState: "AWAITING_APPROVAL", approvalId };
    } catch (err) {
      await safeMarkFailed(deps, state);
      return { currentState: "FAILED", error: toErrorMessage(err) };
    }
  };
}
