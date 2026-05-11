import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const accountStatusEnum = pgEnum("account_status", [
  "active",
  "suspended",
  "terminated",
]);

export const packageStatusEnum = pgEnum("package_status", [
  "draft",
  "active",
  "archived",
]);

export const accounts = pgTable("accounts", {
  id:         uuid("id").primaryKey().defaultRandom(),
  name:       text("name").notNull(),
  status:     accountStatusEnum("status").notNull().default("active"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const packages = pgTable("packages", {
  id:             uuid("id").primaryKey().defaultRandom(),
  name:           text("name").notNull(),
  code:           text("code").notNull().unique(),
  status:         packageStatusEnum("status").notNull().default("draft"),
  application_id: text("application_id").notNull(),
  // All dynamic parameters stored in JSONB — no migration needed to add params
  config:         jsonb("config").notNull().default({}),
  created_at:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accountApplications = pgTable("account_applications", {
  id:             uuid("id").primaryKey().defaultRandom(),
  account_id:     uuid("account_id").notNull().references(() => accounts.id),
  application_id: text("application_id").notNull(),
  package_id:     uuid("package_id").notNull().references(() => packages.id),
  status:         accountStatusEnum("status").notNull().default("active"),
  activated_at:   timestamp("activated_at", { withTimezone: true }),
});

export const accountOverrides = pgTable("account_overrides", {
  id:             uuid("id").primaryKey().defaultRandom(),
  account_id:     uuid("account_id").notNull().references(() => accounts.id),
  application_id: text("application_id").notNull(),
  param_key:      text("param_key").notNull(),
  param_value:    text("param_value").notNull(),
});

// Relations
export const accountsRelations = relations(accounts, ({ many }) => ({
  applications: many(accountApplications),
  overrides:    many(accountOverrides),
}));

export const accountApplicationsRelations = relations(accountApplications, ({ one }) => ({
  account: one(accounts, { fields: [accountApplications.account_id], references: [accounts.id] }),
  package: one(packages, { fields: [accountApplications.package_id], references: [packages.id] }),
}));
