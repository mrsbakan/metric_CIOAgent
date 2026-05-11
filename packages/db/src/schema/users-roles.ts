import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./accounts.js";

export const userTypeEnum = pgEnum("user_type", [
  "admin",
  "power",
  "standard",
  "readonly",
]);

export const userStatusEnum = pgEnum("user_status", [
  "active",
  "inactive",
  "pending",
]);

export const users = pgTable("users", {
  id:            uuid("id").primaryKey().defaultRandom(),
  tenant_id:     uuid("tenant_id").notNull(),
  account_id:    uuid("account_id").notNull().references(() => accounts.id),
  email:         text("email").notNull(),
  password_hash: text("password_hash").notNull(),
  user_type:     userTypeEnum("user_type").notNull().default("standard"),
  status:        userStatusEnum("status").notNull().default("pending"),
  created_at:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const roles = pgTable("roles", {
  id:               uuid("id").primaryKey().defaultRandom(),
  tenant_id:        uuid("tenant_id").notNull(),
  name:             text("name").notNull(),
  description:      text("description"),
  permissions:      jsonb("permissions").notNull().default({}),
  escalation_config: jsonb("escalation_config").notNull().default({}),
  alert_thresholds: jsonb("alert_thresholds").notNull().default({}),
});

export const userRoles = pgTable("user_roles", {
  user_id:     uuid("user_id").notNull().references(() => users.id),
  role_id:     uuid("role_id").notNull().references(() => roles.id),
  assigned_at: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  assigned_by: uuid("assigned_by").references(() => users.id),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  userRoles: many(userRoles),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  userRoles: many(userRoles),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.user_id], references: [users.id] }),
  role: one(roles, { fields: [userRoles.role_id], references: [roles.id] }),
}));
