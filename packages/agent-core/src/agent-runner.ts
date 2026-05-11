import type { AgentDeps, AgentGraphState, AgentRunInput, AgentRunResult, AgentResumeInput } from "./types.js";
import type { AgentState, ActionDecision } from "@cio-agent/shared/types";
import { buildGraph, buildResumeGraph } from "./graph.js";

type GraphOutput = Pick<
  AgentGraphState,
  "sessionId" | "currentState" | "responseText" | "actionDecision" | "actionType" | "actionPayload" | "approvalId" | "error"
>;

export function buildRunResult(result: GraphOutput): AgentRunResult {
  const requiresDraft =
    result.actionDecision === "DRAFT" || result.actionDecision === "APPROVAL_REQUIRED";

  return {
    sessionId:    result.sessionId,
    state:        result.currentState,
    responseText: result.responseText || null,
    actionDraft:
      requiresDraft && result.actionType
        ? {
            actionType: result.actionType,
            payload:    result.actionPayload,
            approvalId: result.approvalId || null,
          }
        : null,
    error: result.error || null,
  };
}

export class AgentRunner {
  private readonly graph:       ReturnType<typeof buildGraph>;
  private readonly resumeGraph: ReturnType<typeof buildResumeGraph>;

  constructor(deps: AgentDeps) {
    this.graph       = buildGraph(deps);
    this.resumeGraph = buildResumeGraph(deps);
  }

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const result = await this.graph.invoke({
      sessionId:            "",
      tenantId:             input.tenantId,
      userId:               input.userId,
      roleId:               input.roleId,
      accountApplicationId: input.accountApplicationId,
      userType:             input.userType,
      currentState:         "RECEIVED" as const,
      userMessage:          input.message,
      ipAddress:            input.ipAddress ?? "",
      context:              {},
      compiledPrompt:       "",
      llmResponseText:      "",
      actionDecision:       "NA" as const,
      actionType:           "",
      actionPayload:        {},
      approvalId:           "",
      responseText:         "",
      error:                "",
    });

    return buildRunResult(result);
  }

  async resume(input: AgentResumeInput): Promise<AgentRunResult> {
    const result = await this.resumeGraph.invoke({
      sessionId:            input.sessionId,
      tenantId:             input.tenantId,
      userId:               input.userId,
      roleId:               input.roleId,
      accountApplicationId: input.accountApplicationId,
      userType:             input.userType,
      currentState:         "AWAITING_APPROVAL" as const,
      userMessage:          "",
      ipAddress:            "",
      context:              {},
      compiledPrompt:       "",
      llmResponseText:      "",
      actionDecision:       "APPROVAL_REQUIRED" as const,
      actionType:           "",
      actionPayload:        {},
      approvalId:           input.approvalId,
      responseText:         "",
      error:                "",
    });
    return buildRunResult(result);
  }
}
