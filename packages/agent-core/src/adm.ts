import type { ActionDecision, CreditActionType, UserType } from "@cio-agent/shared/types";

// Action Decision Matrix — code-level enforcement of write-action approval.
// Approval bypass rate MUST remain 0%: no write action may be AUTONOMOUS.
// Unknown actionType → "NA" (safe default).
export const ADM_TABLE: Readonly<Record<CreditActionType, Readonly<Record<UserType, ActionDecision>>>> = {
  chatbot_simple:      { admin: "AUTONOMOUS",        power: "AUTONOMOUS",        standard: "AUTONOMOUS",        readonly: "AUTONOMOUS"  },
  chatbot_deep:        { admin: "AUTONOMOUS",        power: "AUTONOMOUS",        standard: "AUTONOMOUS",        readonly: "AUTONOMOUS"  },
  report_generate:     { admin: "AUTONOMOUS",        power: "AUTONOMOUS",        standard: "AUTONOMOUS",        readonly: "NA"          },
  notification_send:   { admin: "APPROVAL_REQUIRED", power: "APPROVAL_REQUIRED", standard: "NA",                readonly: "NA"          },
  alert_create_update: { admin: "APPROVAL_REQUIRED", power: "APPROVAL_REQUIRED", standard: "NA",                readonly: "NA"          },
  skill_execute:       { admin: "APPROVAL_REQUIRED", power: "APPROVAL_REQUIRED", standard: "NA",                readonly: "NA"          },
  escalation_trigger:  { admin: "APPROVAL_REQUIRED", power: "APPROVAL_REQUIRED", standard: "NA",                readonly: "NA"          },
  okr_create_assign:   { admin: "APPROVAL_REQUIRED", power: "DRAFT",             standard: "NA",                readonly: "NA"          },
  source_system_write: { admin: "APPROVAL_REQUIRED", power: "APPROVAL_REQUIRED", standard: "NA",                readonly: "NA"          },
};

export function evaluateAdm(actionType: string, userType: UserType): ActionDecision {
  const row = ADM_TABLE[actionType as CreditActionType];
  if (!row) return "NA";
  return row[userType];
}
