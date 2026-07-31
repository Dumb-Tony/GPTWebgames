import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const fieldNotes = sqliteTable("field_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  author: text("author").notNull(),
  category: text("category").notNull().default("idea"),
  content: text("content").notNull(),
  build: text("build").notNull().default("003"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
