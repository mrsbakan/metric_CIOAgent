import { describe, it, expect } from "@jest/globals";
import {
  VALID_TRANSITIONS,
  enforceTransition,
  isTerminal,
  requiresApproval,
} from "../state-machine.js";
import { StateMachineError } from "@cio-agent/shared/errors";
import type { AgentState } from "@cio-agent/shared/types";

const ALL_STATES: AgentState[] = [
  "RECEIVED", "CONTEXT_LOADED", "PROMPT_COMPILED", "LLM_CALLED",
  "ACTION_DECIDED", "AWAITING_APPROVAL", "EXECUTING", "COMPLETED", "FAILED",
];

describe("VALID_TRANSITIONS", () => {
  it("covers every AgentState", () => {
    for (const s of ALL_STATES) {
      expect(VALID_TRANSITIONS[s]).toBeDefined();
    }
  });

  it("terminal states have no outgoing transitions", () => {
    expect(VALID_TRANSITIONS["COMPLETED"]).toHaveLength(0);
    expect(VALID_TRANSITIONS["FAILED"]).toHaveLength(0);
  });
});

describe("enforceTransition — valid paths", () => {
  it.each<[AgentState, AgentState]>([
    ["RECEIVED",          "CONTEXT_LOADED"],
    ["RECEIVED",          "FAILED"],
    ["CONTEXT_LOADED",    "PROMPT_COMPILED"],
    ["CONTEXT_LOADED",    "FAILED"],
    ["PROMPT_COMPILED",   "LLM_CALLED"],
    ["LLM_CALLED",        "ACTION_DECIDED"],
    ["ACTION_DECIDED",    "AWAITING_APPROVAL"],
    ["ACTION_DECIDED",    "EXECUTING"],
    ["ACTION_DECIDED",    "FAILED"],
    ["AWAITING_APPROVAL", "EXECUTING"],
    ["AWAITING_APPROVAL", "FAILED"],
    ["EXECUTING",         "COMPLETED"],
    ["EXECUTING",         "FAILED"],
  ])("%s → %s does not throw", (from, to) => {
    expect(() => enforceTransition(from, to)).not.toThrow();
  });
});

describe("enforceTransition — invalid paths", () => {
  it.each<[AgentState, AgentState]>([
    ["RECEIVED",          "EXECUTING"],
    ["RECEIVED",          "COMPLETED"],
    ["RECEIVED",          "LLM_CALLED"],
    ["CONTEXT_LOADED",    "RECEIVED"],
    ["ACTION_DECIDED",    "RECEIVED"],
    ["AWAITING_APPROVAL", "ACTION_DECIDED"],
    ["COMPLETED",         "RECEIVED"],
    ["FAILED",            "EXECUTING"],
  ])("%s → %s throws StateMachineError", (from, to) => {
    expect(() => enforceTransition(from, to)).toThrow(StateMachineError);
  });

  it("includes the from/to states in the error message", () => {
    try {
      enforceTransition("RECEIVED", "COMPLETED");
    } catch (err) {
      expect((err as Error).message).toContain("RECEIVED");
      expect((err as Error).message).toContain("COMPLETED");
    }
  });
});

describe("isTerminal", () => {
  it("returns true for COMPLETED and FAILED", () => {
    expect(isTerminal("COMPLETED")).toBe(true);
    expect(isTerminal("FAILED")).toBe(true);
  });

  it("returns false for all non-terminal states", () => {
    const nonTerminal: AgentState[] = [
      "RECEIVED", "CONTEXT_LOADED", "PROMPT_COMPILED",
      "LLM_CALLED", "ACTION_DECIDED", "AWAITING_APPROVAL", "EXECUTING",
    ];
    for (const s of nonTerminal) {
      expect(isTerminal(s)).toBe(false);
    }
  });
});

describe("requiresApproval", () => {
  it("returns true for DRAFT", () => {
    expect(requiresApproval("DRAFT")).toBe(true);
  });

  it("returns true for APPROVAL_REQUIRED", () => {
    expect(requiresApproval("APPROVAL_REQUIRED")).toBe(true);
  });

  it("returns false for AUTONOMOUS", () => {
    expect(requiresApproval("AUTONOMOUS")).toBe(false);
  });

  it("returns false for NA", () => {
    expect(requiresApproval("NA")).toBe(false);
  });
});
