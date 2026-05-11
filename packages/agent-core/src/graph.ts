import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import type { AgentState, ActionDecision, UserType } from "@cio-agent/shared/types";
import type { AgentDeps } from "./types.js";
import { makeReceiveNode }        from "./nodes/receive.node.js";
import { makeLoadContextNode }    from "./nodes/load-context.node.js";
import { makeCompilePromptNode }  from "./nodes/compile-prompt.node.js";
import { makeCallLlmNode }        from "./nodes/call-llm.node.js";
import { makeDecideActionNode }   from "./nodes/decide-action.node.js";
import { makeAwaitApprovalNode }  from "./nodes/await-approval.node.js";
import { makeExecuteNode }        from "./nodes/execute.node.js";
import { makeCompleteNode }       from "./nodes/complete.node.js";

// "replace" reducer: last write wins, with an explicit typed default.
// String fields use "" as the "not yet set" sentinel — avoids null/undefined
// type conflicts with LangGraph's ValueType constraints under exactOptionalPropertyTypes.
function r<T>(d: () => T): { reducer: (a: T, b: T) => T; default: () => T } {
  return { reducer: (_a: T, b: T): T => b, default: d };
}

export const AgentStateAnnotation = Annotation.Root({
  sessionId:            Annotation<string>(r(() => "")),
  tenantId:             Annotation<string>(r(() => "")),
  userId:               Annotation<string>(r(() => "")),
  roleId:               Annotation<string>(r(() => "")),
  accountApplicationId: Annotation<string>(r(() => "")),
  userType:             Annotation<UserType>(r<UserType>(() => "readonly")),
  currentState:         Annotation<AgentState>(r<AgentState>(() => "RECEIVED")),
  userMessage:          Annotation<string>(r(() => "")),
  ipAddress:            Annotation<string>(r(() => "")),
  context:              Annotation<Record<string, unknown>>(r(() => ({}))),
  compiledPrompt:       Annotation<string>(r(() => "")),
  llmResponseText:      Annotation<string>(r(() => "")),
  actionDecision:       Annotation<ActionDecision>(r<ActionDecision>(() => "NA")),
  actionType:           Annotation<string>(r(() => "")),
  actionPayload:        Annotation<Record<string, unknown>>(r(() => ({}))),
  approvalId:           Annotation<string>(r(() => "")),
  responseText:         Annotation<string>(r(() => "")),
  error:                Annotation<string>(r(() => "")),
});

type GraphState = typeof AgentStateAnnotation.State;

function failOrNext(next: string) {
  return (state: GraphState): string =>
    state.currentState === "FAILED" ? END : next;
}

export function buildResumeGraph(deps: AgentDeps) {
  return new StateGraph(AgentStateAnnotation)
    .addNode("awaitApproval", makeAwaitApprovalNode(deps))
    .addNode("execute",       makeExecuteNode(deps))
    .addNode("complete",      makeCompleteNode(deps))
    .addEdge(START, "awaitApproval")
    .addConditionalEdges("awaitApproval", (state) => {
      if (state.currentState === "FAILED")            return END;
      if (state.currentState === "AWAITING_APPROVAL") return END;
      return "execute";
    })
    .addConditionalEdges("execute", failOrNext("complete"))
    .addEdge("complete", END)
    .compile();
}

export function buildGraph(deps: AgentDeps) {
  return new StateGraph(AgentStateAnnotation)
    .addNode("receive",       makeReceiveNode(deps))
    .addNode("loadContext",   makeLoadContextNode(deps))
    .addNode("compilePrompt", makeCompilePromptNode(deps))
    .addNode("callLlm",       makeCallLlmNode(deps))
    .addNode("decideAction",  makeDecideActionNode(deps))
    .addNode("awaitApproval", makeAwaitApprovalNode(deps))
    .addNode("execute",       makeExecuteNode(deps))
    .addNode("complete",      makeCompleteNode(deps))
    .addEdge(START, "receive")
    .addConditionalEdges("receive",       failOrNext("loadContext"))
    .addConditionalEdges("loadContext",   failOrNext("compilePrompt"))
    .addConditionalEdges("compilePrompt", failOrNext("callLlm"))
    .addConditionalEdges("callLlm",       failOrNext("decideAction"))
    .addConditionalEdges("decideAction",  (state) => {
      if (state.currentState === "FAILED") return END;
      if (state.currentState === "AWAITING_APPROVAL") return "awaitApproval";
      return "execute";
    })
    .addConditionalEdges("awaitApproval", (state) => {
      if (state.currentState === "FAILED") return END;
      if (state.currentState === "AWAITING_APPROVAL") return END; // suspended — human action required
      return "execute";
    })
    .addConditionalEdges("execute",       failOrNext("complete"))
    .addEdge("complete", END)
    .compile();
}
