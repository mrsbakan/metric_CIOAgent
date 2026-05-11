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
import { users } from "./users-roles.js";

export const promptLayerTypeEnum = pgEnum("prompt_layer_type", [
  "system",
  "general",
  "role",
  "project",
  "user",
]);

export const promptLayers = pgTable("prompt_layers", {
  id:         uuid("id").primaryKey().defaultRandom(),
  tenant_id:  uuid("tenant_id").notNull(),
  layer_type: promptLayerTypeEnum("layer_type").notNull(),
  scope_id:   uuid("scope_id"),              // role_id / user_id / project_id depending on layer_type
  content:    text("content").notNull(),      // AES-256 encrypted
  version:    integer("version").notNull().default(1),
  is_active:  boolean("is_active").notNull().default(true),
  created_by: uuid("created_by").references(() => users.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const promptVersions = pgTable("prompt_versions", {
  id:              uuid("id").primaryKey().defaultRandom(),
  prompt_layer_id: uuid("prompt_layer_id").notNull().references(() => promptLayers.id),
  content:         text("content").notNull(), // AES-256 encrypted
  version:         integer("version").notNull(),
  created_by:      uuid("created_by").references(() => users.id),
  created_at:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revert_of:       integer("revert_of"),     // version number this was reverted from
});

export const skills = pgTable("skills", {
  id:         uuid("id").primaryKey().defaultRandom(),
  tenant_id:  uuid("tenant_id").notNull(),
  layer_type: promptLayerTypeEnum("layer_type").notNull(),
  scope_id:   uuid("scope_id"),
  name:       text("name").notNull(),
  definition: jsonb("definition").notNull().default({}),
  version:    integer("version").notNull().default(1),
  is_active:  boolean("is_active").notNull().default(true),
  created_by: uuid("created_by").references(() => users.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Relations
export const promptLayersRelations = relations(promptLayers, ({ many }) => ({
  versions: many(promptVersions),
}));

export const promptVersionsRelations = relations(promptVersions, ({ one }) => ({
  layer: one(promptLayers, {
    fields: [promptVersions.prompt_layer_id],
    references: [promptLayers.id],
  }),
}));
