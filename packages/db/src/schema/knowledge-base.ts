import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
  customType,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users-roles.js";

// pgvector custom type — 1536 dimensions (OpenAI/Ollama nomic-embed)
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    return value
      .slice(1, -1)
      .split(",")
      .map(Number);
  },
});

export const documentAccessLevelEnum = pgEnum("document_access_level", [
  "private",
  "role",
  "shared",
]);

export const documents = pgTable("documents", {
  id:           uuid("id").primaryKey().defaultRandom(),
  tenant_id:    uuid("tenant_id").notNull(),
  name:         text("name").notNull(),
  type:         text("type").notNull(),              // pdf, docx, txt, etc.
  access_level: documentAccessLevelEnum("access_level").notNull().default("private"),
  scope_id:     uuid("scope_id"),                    // role_id or user_id depending on access_level
  version:      integer("version").notNull().default(1),
  is_active:    boolean("is_active").notNull().default(true),
  uploaded_by:  uuid("uploaded_by").references(() => users.id),
  uploaded_at:  timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const documentChunks = pgTable("document_chunks", {
  id:          uuid("id").primaryKey().defaultRandom(),
  document_id: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  tenant_id:   uuid("tenant_id").notNull(),
  content:     text("content").notNull(),
  embedding:   vector("embedding"),
  chunk_index: integer("chunk_index").notNull(),
  created_at:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Relations
export const documentsRelations = relations(documents, ({ many }) => ({
  chunks: many(documentChunks),
}));

export const documentChunksRelations = relations(documentChunks, ({ one }) => ({
  document: one(documents, {
    fields: [documentChunks.document_id],
    references: [documents.id],
  }),
}));
