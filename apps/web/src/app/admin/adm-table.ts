// Mirror of packages/agent-core/src/adm.ts — kept in sync manually
// Source of truth is the backend ADM_TABLE
export const ADM_TABLE = {
  chatbot_simple:         { admin: "AUTONOMOUS",        power: "AUTONOMOUS",        standard: "AUTONOMOUS",        readonly: "AUTONOMOUS" },
  chatbot_deep:           { admin: "AUTONOMOUS",        power: "AUTONOMOUS",        standard: "APPROVAL_REQUIRED", readonly: "NA" },
  alert_create_update:    { admin: "AUTONOMOUS",        power: "DRAFT",             standard: "NA",                readonly: "NA" },
  source_system_write:    { admin: "APPROVAL_REQUIRED", power: "APPROVAL_REQUIRED", standard: "NA",                readonly: "NA" },
  okr_create_assign:      { admin: "APPROVAL_REQUIRED", power: "DRAFT",             standard: "NA",                readonly: "NA" },
  skill_execute:          { admin: "AUTONOMOUS",        power: "DRAFT",             standard: "NA",                readonly: "NA" },
  escalation_trigger:     { admin: "APPROVAL_REQUIRED", power: "APPROVAL_REQUIRED", standard: "NA",                readonly: "NA" },
  notification_send:      { admin: "AUTONOMOUS",        power: "AUTONOMOUS",        standard: "DRAFT",             readonly: "NA" },
  report_generate:        { admin: "AUTONOMOUS",        power: "AUTONOMOUS",        standard: "AUTONOMOUS",        readonly: "AUTONOMOUS" },
} as const;
