import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const fieldNotes = sqliteTable("field_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  author: text("author").notNull(),
  category: text("category").notNull().default("idea"),
  content: text("content").notNull(),
  build: text("build").notNull().default("003"),
  status: text("status").notNull().default("open"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const crewRooms = sqliteTable("crew_rooms", {
  code: text("code").primaryKey(),
  hostMemberId: text("host_member_id").notNull(),
  missionSeed: integer("mission_seed").notNull(),
  phase: text("phase").notNull().default("lobby"),
  authoritativeState: text("authoritative_state"),
  revision: integer("revision").notNull().default(0),
  actionCursor: integer("action_cursor").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const crewMembers = sqliteTable(
  "crew_members",
  {
    id: text("id").primaryKey(),
    roomCode: text("room_code").notNull(),
    token: text("token").notNull(),
    name: text("name").notNull(),
    colorIndex: integer("color_index").notNull(),
    role: text("role").notNull(),
    x: integer("x").notNull().default(-12000),
    y: integer("y").notNull().default(0),
    z: integer("z").notNull().default(5000),
    yaw: integer("yaw").notNull().default(0),
    inputMask: integer("input_mask").notNull().default(0),
    actionSequence: integer("action_sequence").notNull().default(0),
    joinedAt: text("joined_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("crew_members_room_idx").on(table.roomCode),
    uniqueIndex("crew_members_token_idx").on(table.token),
  ],
);

export const crewActions = sqliteTable(
  "crew_actions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    roomCode: text("room_code").notNull(),
    memberId: text("member_id").notNull(),
    sequence: integer("sequence").notNull(),
    type: text("type").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("crew_actions_room_id_idx").on(table.roomCode, table.id),
    uniqueIndex("crew_actions_member_sequence_idx").on(
      table.memberId,
      table.sequence,
    ),
  ],
);
