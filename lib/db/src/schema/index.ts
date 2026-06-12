// LunamHub database schema
// All tables for the family command centre

import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── Enums ─────────────────────────────────────────────────────────────────────

export const roleEnum = pgEnum("role", ["parent", "child"]);
export const repeatTypeEnum = pgEnum("repeat_type", ["once", "daily", "weekly"]);
export const choreStatusEnum = pgEnum("chore_status", ["pending", "completed", "approved", "missed"]);
export const eventCategoryEnum = pgEnum("event_category", ["school", "sport", "appointment", "birthday", "family", "other"]);
export const redemptionStatusEnum = pgEnum("redemption_status", ["pending", "approved", "rejected"]);
export const listCategoryEnum = pgEnum("list_category", ["grocery", "packing", "school", "reminders", "other"]);
export const mealTypeEnum = pgEnum("meal_type", ["breakfast", "lunch", "dinner", "snack"]);
export const timeOfDayEnum = pgEnum("time_of_day", ["morning", "afternoon", "evening", "bedtime"]);
export const transactionTypeEnum = pgEnum("transaction_type", ["chore_earned", "reward_spent", "bonus", "adjustment"]);
export const badgeTierEnum = pgEnum("badge_tier", ["bronze", "silver", "gold"]);

// ── Family Members ────────────────────────────────────────────────────────────

export const familyMembersTable = pgTable("family_members", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  emoji: text("emoji").notNull().default("😊"),
  color: text("color").notNull().default("#4f46e5"),
  role: roleEnum("role").notNull().default("child"),
  pointsBalance: integer("points_balance").notNull().default(0),
  lifetimePoints: integer("lifetime_points").notNull().default(0),
  avatarUrl: text("avatar_url"),
  pinHash: text("pin_hash"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertFamilyMemberSchema = createInsertSchema(familyMembersTable).omit({ id: true, createdAt: true });
export type InsertFamilyMember = z.infer<typeof insertFamilyMemberSchema>;
export type FamilyMember = typeof familyMembersTable.$inferSelect;

// ── Events ────────────────────────────────────────────────────────────────────

export const eventsTable = pgTable("events", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  date: text("date").notNull(), // YYYY-MM-DD
  startTime: text("start_time"),
  endTime: text("end_time"),
  allDay: boolean("all_day").notNull().default(false),
  category: eventCategoryEnum("category").notNull().default("other"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertEventSchema = createInsertSchema(eventsTable).omit({ id: true, createdAt: true });
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof eventsTable.$inferSelect;

// Junction table: events <-> family members
export const eventMembersTable = pgTable("event_members", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull().references(() => eventsTable.id, { onDelete: "cascade" }),
  memberId: integer("member_id").notNull().references(() => familyMembersTable.id, { onDelete: "cascade" }),
});

// ── Chores ────────────────────────────────────────────────────────────────────

export const choresTable = pgTable("chores", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  assignedTo: integer("assigned_to").references(() => familyMembersTable.id, { onDelete: "set null" }),
  dueDate: text("due_date"), // YYYY-MM-DD
  repeatType: repeatTypeEnum("repeat_type").notNull().default("once"),
  pointsValue: integer("points_value").notNull().default(10),
  status: choreStatusEnum("status").notNull().default("pending"),
  completedAt: timestamp("completed_at"),
  approvedAt: timestamp("approved_at"),
  approvedByParentId: integer("approved_by_parent_id").references(() => familyMembersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertChoreSchema = createInsertSchema(choresTable).omit({ id: true, createdAt: true });
export type InsertChore = z.infer<typeof insertChoreSchema>;
export type Chore = typeof choresTable.$inferSelect;

// ── Rewards ───────────────────────────────────────────────────────────────────

export const rewardsTable = pgTable("rewards", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  pointsCost: integer("points_cost").notNull().default(100),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRewardSchema = createInsertSchema(rewardsTable).omit({ id: true, createdAt: true });
export type InsertReward = z.infer<typeof insertRewardSchema>;
export type Reward = typeof rewardsTable.$inferSelect;

// ── Reward Redemptions ────────────────────────────────────────────────────────

export const redemptionsTable = pgTable("reward_redemptions", {
  id: serial("id").primaryKey(),
  rewardId: integer("reward_id").notNull().references(() => rewardsTable.id, { onDelete: "cascade" }),
  memberId: integer("member_id").notNull().references(() => familyMembersTable.id, { onDelete: "cascade" }),
  pointsCost: integer("points_cost").notNull().default(0),
  status: redemptionStatusEnum("status").notNull().default("pending"),
  approvedByParentId: integer("approved_by_parent_id").references(() => familyMembersTable.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRedemptionSchema = createInsertSchema(redemptionsTable).omit({ id: true, createdAt: true });
export type InsertRedemption = z.infer<typeof insertRedemptionSchema>;
export type Redemption = typeof redemptionsTable.$inferSelect;

// ── Point Transactions ────────────────────────────────────────────────────────

export const pointTransactionsTable = pgTable("point_transactions", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull().references(() => familyMembersTable.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  type: transactionTypeEnum("type").notNull(),
  description: text("description").notNull(),
  choreId: integer("chore_id").references(() => choresTable.id, { onDelete: "set null" }),
  redemptionId: integer("redemption_id").references(() => redemptionsTable.id, { onDelete: "set null" }),
  approvedByParentId: integer("approved_by_parent_id").references(() => familyMembersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPointTransactionSchema = createInsertSchema(pointTransactionsTable).omit({ id: true, createdAt: true });
export type InsertPointTransaction = z.infer<typeof insertPointTransactionSchema>;
export type PointTransaction = typeof pointTransactionsTable.$inferSelect;

// ── Badges ────────────────────────────────────────────────────────────────────

export const badgesTable = pgTable("badges", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull().references(() => familyMembersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  emoji: text("emoji").notNull().default("🏆"),
  tier: badgeTierEnum("tier").notNull().default("bronze"),
  awardedAt: timestamp("awarded_at").notNull().defaultNow(),
});

export const insertBadgeSchema = createInsertSchema(badgesTable).omit({ id: true, awardedAt: true });
export type InsertBadge = z.infer<typeof insertBadgeSchema>;
export type Badge = typeof badgesTable.$inferSelect;

// ── Lists ─────────────────────────────────────────────────────────────────────

export const listsTable = pgTable("lists", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: listCategoryEnum("category").notNull().default("other"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertListSchema = createInsertSchema(listsTable).omit({ id: true, createdAt: true });
export type InsertList = z.infer<typeof insertListSchema>;
export type SharedList = typeof listsTable.$inferSelect;

// ── List Items ────────────────────────────────────────────────────────────────

export const listItemsTable = pgTable("list_items", {
  id: serial("id").primaryKey(),
  listId: integer("list_id").notNull().references(() => listsTable.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  completed: boolean("completed").notNull().default(false),
  assignedTo: integer("assigned_to").references(() => familyMembersTable.id, { onDelete: "set null" }),
  category: text("category"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertListItemSchema = createInsertSchema(listItemsTable).omit({ id: true, createdAt: true });
export type InsertListItem = z.infer<typeof insertListItemSchema>;
export type ListItem = typeof listItemsTable.$inferSelect;

// ── Meals ─────────────────────────────────────────────────────────────────────

export const mealsTable = pgTable("meals", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  notes: text("notes"),
  ingredients: text("ingredients"), // comma-separated or free-form text
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMealSchema = createInsertSchema(mealsTable).omit({ id: true, createdAt: true });
export type InsertMeal = z.infer<typeof insertMealSchema>;
export type Meal = typeof mealsTable.$inferSelect;

// ── Meal Plan ─────────────────────────────────────────────────────────────────

export const mealPlanTable = pgTable("meal_plan", {
  id: serial("id").primaryKey(),
  mealId: integer("meal_id").notNull().references(() => mealsTable.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // YYYY-MM-DD
  mealType: mealTypeEnum("meal_type").notNull().default("dinner"),
});

export const insertMealPlanSchema = createInsertSchema(mealPlanTable).omit({ id: true });
export type InsertMealPlan = z.infer<typeof insertMealPlanSchema>;
export type MealPlan = typeof mealPlanTable.$inferSelect;

// ── Routines ──────────────────────────────────────────────────────────────────

export const routinesTable = pgTable("routines", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  assignedTo: integer("assigned_to").references(() => familyMembersTable.id, { onDelete: "set null" }),
  timeOfDay: timeOfDayEnum("time_of_day").notNull().default("morning"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRoutineSchema = createInsertSchema(routinesTable).omit({ id: true, createdAt: true });
export type InsertRoutine = z.infer<typeof insertRoutineSchema>;
export type Routine = typeof routinesTable.$inferSelect;

// ── Routine Items ─────────────────────────────────────────────────────────────

export const routineItemsTable = pgTable("routine_items", {
  id: serial("id").primaryKey(),
  routineId: integer("routine_id").notNull().references(() => routinesTable.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  order: integer("order").notNull().default(0),
});

export const insertRoutineItemSchema = createInsertSchema(routineItemsTable).omit({ id: true });
export type InsertRoutineItem = z.infer<typeof insertRoutineItemSchema>;
export type RoutineItem = typeof routineItemsTable.$inferSelect;

// ── Routine Completions ───────────────────────────────────────────────────────

export const routineCompletionsTable = pgTable("routine_completions", {
  id: serial("id").primaryKey(),
  routineId: integer("routine_id").notNull().references(() => routinesTable.id, { onDelete: "cascade" }),
  routineItemId: integer("routine_item_id").notNull().references(() => routineItemsTable.id, { onDelete: "cascade" }),
  completedAt: timestamp("completed_at").notNull().defaultNow(),
});

export const insertRoutineCompletionSchema = createInsertSchema(routineCompletionsTable).omit({ id: true, completedAt: true });
export type InsertRoutineCompletion = z.infer<typeof insertRoutineCompletionSchema>;
export type RoutineCompletion = typeof routineCompletionsTable.$inferSelect;

// ── Settings ──────────────────────────────────────────────────────────────────

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  parentPin: text("parent_pin").notNull().default("1234"),
  appName: text("app_name").notNull().default("LunamHub"),
  timezone: text("timezone").notNull().default("UTC"),
  displayMode: boolean("display_mode").notNull().default(false),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
