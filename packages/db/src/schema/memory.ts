import {
  pgTable,
  uuid,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { users, roles } from "./users-roles.js";

// AES-256 encryption applied at application layer before INSERT.
// The `value` column stores ciphertext — raw DB access cannot read content.

export const memoryPrivateUser = pgTable("memory_private_user", {
  id:         uuid("id").primaryKey().defaultRandom(),
  tenant_id:  uuid("tenant_id").notNull(),
  user_id:    uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  key:        text("key").notNull(),
  value:      text("value").notNull(), // AES-256 encrypted ciphertext
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.tenant_id, t.user_id, t.key)]);

export const memoryPrivateRole = pgTable("memory_private_role", {
  id:         uuid("id").primaryKey().defaultRandom(),
  tenant_id:  uuid("tenant_id").notNull(),
  role_id:    uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  key:        text("key").notNull(),
  value:      text("value").notNull(), // AES-256 encrypted ciphertext
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.tenant_id, t.role_id, t.key)]);

export const memoryShared = pgTable("memory_shared", {
  id:         uuid("id").primaryKey().defaultRandom(),
  tenant_id:  uuid("tenant_id").notNull(),
  key:        text("key").notNull(),
  value:      text("value").notNull(),
  created_by: uuid("created_by").references(() => users.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
