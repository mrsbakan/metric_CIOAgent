import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const connectorTypeEnum = pgEnum("connector_type", [
  "jira",
  "servicenow",
  "azure",
  "spirai",
]);

export const connectorEventStatusEnum = pgEnum("connector_event_status", [
  "pending",
  "processed",
  "dlq",
]);

export const connectors = pgTable("connectors", {
  id:             uuid("id").primaryKey().defaultRandom(),
  tenant_id:      uuid("tenant_id").notNull(),
  type:           connectorTypeEnum("type").notNull(),
  name:           text("name").notNull(),
  auth_config:    text("auth_config").notNull(), // AES-256 encrypted JSON
  field_mapping:  jsonb("field_mapping").notNull().default({}),
  webhook_config: jsonb("webhook_config").notNull().default({}),
  is_active:      boolean("is_active").notNull().default(true),
  created_at:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const connectorEvents = pgTable("connector_events", {
  id:           uuid("id").primaryKey().defaultRandom(),
  tenant_id:    uuid("tenant_id").notNull(),
  connector_id: uuid("connector_id").notNull().references(() => connectors.id),
  event_type:   text("event_type").notNull(),
  payload:      jsonb("payload").notNull().default({}),
  status:       connectorEventStatusEnum("status").notNull().default("pending"),
  received_at:  timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processed_at: timestamp("processed_at", { withTimezone: true }),
  retry_count:  integer("retry_count").notNull().default(0),
});

// Relations
export const connectorsRelations = relations(connectors, ({ many }) => ({
  events: many(connectorEvents),
}));

export const connectorEventsRelations = relations(connectorEvents, ({ one }) => ({
  connector: one(connectors, {
    fields: [connectorEvents.connector_id],
    references: [connectors.id],
  }),
}));
