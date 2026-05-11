import {
  pgTable,
  uuid,
  text,
  jsonb,
  inet,
  timestamp,
} from "drizzle-orm/pg-core";

// INSERT-only — no UPDATE, no DELETE (enforced at DB level via REVOKE + RLS)
export const auditEvents = pgTable("audit_events", {
  id:           uuid("id").primaryKey().defaultRandom(),
  tenant_id:    uuid("tenant_id").notNull(),
  user_id:      uuid("user_id"),
  session_id:   uuid("session_id"),
  event_type:   text("event_type").notNull(),
  action:       text("action"),
  entity_type:  text("entity_type"),
  entity_id:    uuid("entity_id"),
  before_state: jsonb("before_state"),
  after_state:  jsonb("after_state"),
  ip_address:   inet("ip_address"),
  user_agent:   text("user_agent"),
  created_at:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AuditEventInsert = typeof auditEvents.$inferInsert;
export type AuditEventSelect = typeof auditEvents.$inferSelect;
