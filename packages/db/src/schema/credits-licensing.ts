import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { accountApplications } from "./accounts.js";

export const creditTypeEnum = pgEnum("credit_type", ["credit", "debit"]);

export const licenseStatusEnum = pgEnum("license_status", [
  "active",
  "expiring",
  "expired",
  "read_only",
]);

// Append-only — no UPDATE or DELETE. Balance = SUM(amount WHERE type=credit) - SUM(amount WHERE type=debit)
export const creditLedger = pgTable("credit_ledger", {
  id:                     uuid("id").primaryKey().defaultRandom(),
  tenant_id:              uuid("tenant_id").notNull(),
  account_application_id: uuid("account_application_id").notNull().references(() => accountApplications.id),
  amount:                 integer("amount").notNull(),
  type:                   creditTypeEnum("type").notNull(),
  action_type:            text("action_type").notNull(),
  reference_id:           uuid("reference_id"),  // agent_session_id or approval_id
  created_at:             timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const licenseTokens = pgTable("license_tokens", {
  id:                     uuid("id").primaryKey().defaultRandom(),
  tenant_id:              uuid("tenant_id").notNull(),
  account_application_id: uuid("account_application_id").notNull().references(() => accountApplications.id),
  // RSA-256 signed JWT — stored in full for local validation.
  // jti (JWT ID) tracked to prevent replay attacks.
  token:          text("token").notNull(),
  jti:            text("jti").notNull().unique(),  // prevents replay — same token cannot be applied twice
  issued_at:      timestamp("issued_at", { withTimezone: true }).notNull(),
  expires_at:     timestamp("expires_at", { withTimezone: true }).notNull(),
  last_synced_at: timestamp("last_synced_at", { withTimezone: true }),
  status:         licenseStatusEnum("status").notNull().default("active"),
});
