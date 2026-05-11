import type { AgentState, ActionDecision } from "@cio-agent/shared/types";
import { StateMachineError } from "@cio-agent/shared/errors";

export const VALID_TRANSITIONS: Readonly<Record<AgentState, readonly AgentState[]>> = {
  RECEIVED:          ["CONTEXT_LOADED", "FAILED"],
  CONTEXT_LOADED:    ["PROMPT_COMPILED", "FAILED"],
  PROMPT_COMPILED:   ["LLM_CALLED",      "FAILED"],
  LLM_CALLED:        ["ACTION_DECIDED",  "FAILED"],
  ACTION_DECIDED:    ["AWAITING_APPROVAL", "EXECUTING", "FAILED"],
  AWAITING_APPROVAL: ["EXECUTING",        "FAILED"],
  EXECUTING:         ["COMPLETED",        "FAILED"],
  COMPLETED:         [],
  FAILED:            [],
};

export function enforceTransition(from: AgentState, to: AgentState): void {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new StateMachineError(from, to);
  }
}

export function isTerminal(state: AgentState): boolean {
  return state === "COMPLETED" || state === "FAILED";
}

export function requiresApproval(decision: ActionDecision): boolean {
  return decision === "DRAFT" || decision === "APPROVAL_REQUIRED";
}
