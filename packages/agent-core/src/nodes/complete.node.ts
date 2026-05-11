import type { AgentGraphState, AgentDeps } from "../types.js";

// Terminal node: sets final responseText. No state transition — already COMPLETED.
export function makeCompleteNode(_deps: AgentDeps) {
  return async (state: AgentGraphState): Promise<Partial<AgentGraphState>> => {
    const responseText = state.llmResponseText || "Done.";
    return { responseText };
  };
}
