import { describe, it, expect } from "@jest/globals";
import { evaluateAdm, ADM_TABLE } from "../adm.js";
import type { CreditActionType, UserType } from "@cio-agent/shared/types";

// ─── ADM_TABLE completeness ───────────────────────────────────────────────────

describe("ADM_TABLE", () => {
  const ALL_USER_TYPES: UserType[]       = ["admin", "power", "standard", "readonly"];
  const ALL_ACTION_TYPES: CreditActionType[] = [
    "chatbot_simple", "chatbot_deep", "report_generate",
    "notification_send", "alert_create_update", "skill_execute",
    "escalation_trigger", "okr_create_assign", "source_system_write",
  ];

  it("covers all CreditActionType entries", () => {
    for (const action of ALL_ACTION_TYPES) {
      expect(ADM_TABLE[action]).toBeDefined();
    }
  });

  it("covers all UserType entries for every action", () => {
    for (const action of ALL_ACTION_TYPES) {
      for (const userType of ALL_USER_TYPES) {
        expect(ADM_TABLE[action]![userType]).toBeDefined();
      }
    }
  });

  it("write actions are never AUTONOMOUS (approval bypass rate = 0%)", () => {
    const writeActions: CreditActionType[] = [
      "notification_send", "alert_create_update", "skill_execute",
      "escalation_trigger", "okr_create_assign", "source_system_write",
    ];
    for (const action of writeActions) {
      for (const userType of ALL_USER_TYPES) {
        expect(ADM_TABLE[action]![userType]).not.toBe("AUTONOMOUS");
      }
    }
  });
});

// ─── evaluateAdm — read actions ───────────────────────────────────────────────

describe("evaluateAdm — read-only actions", () => {
  it("chatbot_simple → AUTONOMOUS for all user types", () => {
    expect(evaluateAdm("chatbot_simple", "admin")).toBe("AUTONOMOUS");
    expect(evaluateAdm("chatbot_simple", "power")).toBe("AUTONOMOUS");
    expect(evaluateAdm("chatbot_simple", "standard")).toBe("AUTONOMOUS");
    expect(evaluateAdm("chatbot_simple", "readonly")).toBe("AUTONOMOUS");
  });

  it("chatbot_deep → AUTONOMOUS for all user types", () => {
    expect(evaluateAdm("chatbot_deep", "admin")).toBe("AUTONOMOUS");
    expect(evaluateAdm("chatbot_deep", "readonly")).toBe("AUTONOMOUS");
  });

  it("report_generate → AUTONOMOUS for admin/power/standard; NA for readonly", () => {
    expect(evaluateAdm("report_generate", "admin")).toBe("AUTONOMOUS");
    expect(evaluateAdm("report_generate", "power")).toBe("AUTONOMOUS");
    expect(evaluateAdm("report_generate", "standard")).toBe("AUTONOMOUS");
    expect(evaluateAdm("report_generate", "readonly")).toBe("NA");
  });
});

// ─── evaluateAdm — write actions ─────────────────────────────────────────────

describe("evaluateAdm — write actions → APPROVAL_REQUIRED for admin/power", () => {
  const writeActions: CreditActionType[] = [
    "notification_send", "alert_create_update", "skill_execute",
    "escalation_trigger", "source_system_write",
  ];

  for (const action of writeActions) {
    it(`${action} → APPROVAL_REQUIRED for admin`, () => {
      expect(evaluateAdm(action, "admin")).toBe("APPROVAL_REQUIRED");
    });

    it(`${action} → APPROVAL_REQUIRED for power`, () => {
      expect(evaluateAdm(action, "power")).toBe("APPROVAL_REQUIRED");
    });

    it(`${action} → NA for standard`, () => {
      expect(evaluateAdm(action, "standard")).toBe("NA");
    });

    it(`${action} → NA for readonly`, () => {
      expect(evaluateAdm(action, "readonly")).toBe("NA");
    });
  }
});

// ─── evaluateAdm — okr_create_assign ─────────────────────────────────────────

describe("evaluateAdm — okr_create_assign", () => {
  it("admin → APPROVAL_REQUIRED", () => {
    expect(evaluateAdm("okr_create_assign", "admin")).toBe("APPROVAL_REQUIRED");
  });

  it("power → DRAFT", () => {
    expect(evaluateAdm("okr_create_assign", "power")).toBe("DRAFT");
  });

  it("standard → NA", () => {
    expect(evaluateAdm("okr_create_assign", "standard")).toBe("NA");
  });

  it("readonly → NA", () => {
    expect(evaluateAdm("okr_create_assign", "readonly")).toBe("NA");
  });
});

// ─── evaluateAdm — unknown actionType ────────────────────────────────────────

describe("evaluateAdm — unknown actionType", () => {
  it("returns NA for unrecognised action (safe default)", () => {
    expect(evaluateAdm("totally_unknown_action", "admin")).toBe("NA");
    expect(evaluateAdm("", "power")).toBe("NA");
  });
});
