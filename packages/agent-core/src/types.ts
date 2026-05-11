import type { AgentState, ActionDecision, UserType } from "@cio-agent/shared/types";
import type { AuditService } from "@cio-agent/audit";
import type { ISessionRepository } from "./session-repository.js";
import type { IPromptCompiler } from "@cio-agent/prompt-compiler";
import type { IMemoryService } from "./memory/memory-service.js";

// String fields use "" as the "not yet set" sentinel — avoids null/undefined
// type conflicts with @langchain/langgraph's ValueType constraints.
export interface AgentGraphState {
  sessionId:            string;  // "" until set by receiveNode
  tenantId:             string;
  userId:               string;
  roleId:               string;
  accountApplicationId: string;
  userType:             UserType;
  currentState:         AgentState;
  userMessage:          string;
  ipAddress:            string;   // "" if no IP available
  context:              Record<string, unknown>;
  compiledPrompt:       string;   // "" until compilePromptNode
  llmResponseText:      string;   // "" until callLlmNode
  actionDecision:       ActionDecision;
  actionType:           string;   // "" if no action
  actionPayload:        Record<string, unknown>;
  approvalId:           string;   // "" if no pending approval
  responseText:         string;   // "" until completeNode
  error:                string;   // "" if no error
}

export interface AgentRunInput {
  tenantId:             string;
  userId:               string;
  roleId:               string;
  accountApplicationId: string;
  userType:             UserType;
  message:              string;
  ipAddress?:           string;
}

export interface AgentRunResult {
  sessionId:    string;
  state:        AgentState;
  responseText: string | null;
  actionDraft: {
    actionType: string;
    payload:    Record<string, unknown>;
    approvalId: string | null;
  } | null;
  error: string | null;
}

export interface ApprovalLockHandle {
  release(): Promise<void>;
}

export interface AgentDeps {
  sessionRepo:         ISessionRepository;
  auditService:        AuditService;
  promptCompiler:      IPromptCompiler;
  memoryService:       IMemoryService;
  acquireApprovalLock: (sessionId: string) => Promise<ApprovalLockHandle | null>;
}

export interface AgentResumeInput {
  tenantId:             string;
  userId:               string;
  roleId:               string;
  accountApplicationId: string;
  userType:             UserType;
  sessionId:            string;
  approvalId:           string;
}
