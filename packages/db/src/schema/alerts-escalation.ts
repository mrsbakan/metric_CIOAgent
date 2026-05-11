import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { users, roles } from "./users-roles.js";

export const alerts = pgTable("alerts", {
  id:             uuid("id").primaryKey().defaultRandom(),
  tenant_id:      uuid("tenant_id").notNull(),
  name:           text("name").notNull(),
  source_system:  text("source_system"),
  trigger_config: jsonb("trigger_config").notNull().default({}),
  action_config:  jsonb("action_config").notNull().default({}),
  owner_role_id:  uuid("owner_role_id").references(() => roles.id),
  priority:       integer("priority").notNull().default(3), // 1 = critical, 5 = low
  is_active:      boolean("is_active").notNull().default(true),
  created_by:     uuid("created_by").references(() => users.id),
  created_at:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const escalationRules = pgTable("escalation_rules", {
  id:                  uuid("id").primaryKey().defaultRandom(),
  tenant_id:           uuid("tenant_id").notNull(),
  role_id:             uuid("role_id").notNull().references(() => roles.id),
  trigger_config:      jsonb("trigger_config").notNull().default({}),
  target_role_id:      uuid("target_role_id").references(() => roles.id),
  target_user_id:      uuid("target_user_id").references(() => users.id),
  action_on_escalation: text("action_on_escalation").notNull(),
  time_window_seconds: integer("time_window_seconds").notNull(),
});
