import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users, roles } from "./users-roles.js";

export const agentStateEnum = pgEnum("agent_state", [
  "RECEIVED",
  "CONTEXT_LOADED",
  "PROMPT_COMPILED",
  "LLM_CALLED",
  "ACTION_DECIDED",
  "AWAITING_APPROVAL",
  "EXECUTING",
  "COMPLETED",
  "FAILED",
]);

export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "approved",
  "rejected",
]);

export const agentSessions = pgTable("agent_sessions", {
  id:         uuid("id").primaryKey().defaultRandom(),
  tenant_id:  uuid("tenant_id").notNull(),
  user_id:    uuid("user_id").notNull().references(() => users.id),
  role_id:    uuid("role_id").notNull().references(() => roles.id),
  state:      agentStateEnum("state").notNull().default("RECEIVED"),
  context:    jsonb("context").notNull().default({}),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const pendingApprovals = pgTable("pending_approvals", {
  id:           uuid("id").primaryKey().defaultRandom(),
  tenant_id:    uuid("tenant_id").notNull(),
  session_id:   uuid("session_id").notNull().references(() => agentSessions.id),
  action_type:  text("action_type").notNull(),
  payload:      jsonb("payload").notNull().default({}),
  status:       approvalStatusEnum("status").notNull().default("pending"),
  requested_at: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  resolved_at:  timestamp("resolved_at", { withTimezone: true }),
  resolved_by:  uuid("resolved_by").references(() => users.id),
});

// Relations
export const agentSessionsRelations = relations(agentSessions, ({ one, many }) => ({
  user:     one(users, { fields: [agentSessions.user_id], references: [users.id] }),
  role:     one(roles, { fields: [agentSessions.role_id], references: [roles.id] }),
  approvals: many(pendingApprovals),
}));

export const pendingApprovalsRelations = relations(pendingApprovals, ({ one }) => ({
  session: one(agentSessions, {
    fields: [pendingApprovals.session_id],
    references: [agentSessions.id],
  }),
  resolver: one(users, {
    fields: [pendingApprovals.resolved_by],
    references: [users.id],
  }),
}));
