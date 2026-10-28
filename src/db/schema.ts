import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  uid: text("uid").notNull().unique(),
  email: text("email").notNull(),
  displayName: text("display_name"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  name: text("name").notNull(),
  thumb: text("thumb"),
  durationSec: integer("duration_sec").default(0),
  clipCount: integer("clip_count").default(0),
  niche: text("niche").default("Documentary"),
  currentStage: integer("current_stage").default(1),
  progressPct: integer("progress_pct").default(0),
  status: text("status").default("Draft"),
  archived: boolean("archived").default(false),
  data: text("data").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const userSettings = pgTable("user_settings", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  data: text("data").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
