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
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── Enums ─────────────────────────────────────────────────────────────────────

export const roleEnum = pgEnum("role", ["parent", "child"]);
export const repeatTypeEnum = pgEnum("repeat_type", ["once", "daily", "weekly"]);
// Legacy enum kept for the old chores table (do not remove — FK exists via point_transactions)
export const choreStatusEnum = pgEnum("chore_status", ["pending", "completed", "approved", "missed"]);
// New enum for chore_instances
export const choreInstanceStatusEnum = pgEnum("chore_instance_status", [
  "todo", "pending_approval", "done", "missed", "rejected",
]);
export const eventCategoryEnum = pgEnum("event_category", ["school", "sport", "appointment", "birthday", "family", "other"]);
export const redemptionStatusEnum = pgEnum("redemption_status", ["pending", "approved", "rejected", "fulfilled"]);
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
  location: text("location"),
  date: text("date").notNull(), // YYYY-MM-DD
  startTime: text("start_time"),
  endTime: text("end_time"),
  allDay: boolean("all_day").notNull().default(false),
  category: eventCategoryEnum("category").notNull().default("other"),
  recurrence: text("recurrence"), // DAILY | WEEKLY | FORTNIGHTLY | MONTHLY | YEARLY | null
  recurrenceEndDate: text("recurrence_end_date"), // YYYY-MM-DD, optional end for recurring events
  recurrenceDays: text("recurrence_days"), // comma-separated day-of-week numbers 0=Sun..6=Sat e.g. "1,4" for Mon+Thu
  recurrenceExceptions: text("recurrence_exceptions"), // comma-separated YYYY-MM-DD dates to skip in recurring series
  googleEventId: text("google_event_id"), // Google Calendar event ID for synced events
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertEventSchema = createInsertSchema(eventsTable).omit({ id: true, createdAt: true, googleEventId: true });
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof eventsTable.$inferSelect;

// Junction table: events <-> family members
export const eventMembersTable = pgTable("event_members", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull().references(() => eventsTable.id, { onDelete: "cascade" }),
  memberId: integer("member_id").notNull().references(() => familyMembersTable.id, { onDelete: "cascade" }),
});

// ── Chores (legacy — kept for point_transactions FK; do not drop) ─────────────

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

// ── Chore Templates ───────────────────────────────────────────────────────────

export const choreTemplatesTable = pgTable("chore_templates", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  pointsValue: integer("points_value").notNull().default(10),
  repeatType: repeatTypeEnum("repeat_type").notNull().default("once"),
  // JSON array of day-of-week numbers (0=Sun … 6=Sat) for weekly chores, e.g. "[1,3]"
  daysOfWeek: text("days_of_week"),
  requiresApproval: boolean("requires_approval").notNull().default(true),
  active: boolean("active").notNull().default(true),
  createdBy: integer("created_by").references(() => familyMembersTable.id, { onDelete: "set null" }),
  // Tracks which legacy chores.id this template was migrated from (enables idempotent migration)
  legacyChoreId: integer("legacy_chore_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertChoreTemplateSchema = createInsertSchema(choreTemplatesTable).omit({ id: true, createdAt: true });
export type InsertChoreTemplate = z.infer<typeof insertChoreTemplateSchema>;
export type ChoreTemplate = typeof choreTemplatesTable.$inferSelect;

// Junction table: chore_templates <-> children
export const choreTemplateChildrenTable = pgTable("chore_template_children", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => choreTemplatesTable.id, { onDelete: "cascade" }),
  childId: integer("child_id").notNull().references(() => familyMembersTable.id, { onDelete: "cascade" }),
});

// ── Chore Instances ───────────────────────────────────────────────────────────

export const choreInstancesTable = pgTable("chore_instances", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").references(() => choreTemplatesTable.id, { onDelete: "cascade" }),
  childId: integer("child_id").references(() => familyMembersTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  pointsValue: integer("points_value").notNull().default(10),
  repeatType: repeatTypeEnum("repeat_type").notNull().default("once"),
  dueDate: text("due_date").notNull(), // YYYY-MM-DD
  status: choreInstanceStatusEnum("status").notNull().default("todo"),
  pointsAwarded: boolean("points_awarded").notNull().default(false),
  completedAt: timestamp("completed_at"),
  approvedAt: timestamp("approved_at"),
  approvedByParentId: integer("approved_by_parent_id").references(() => familyMembersTable.id, { onDelete: "set null" }),
  missedAt: timestamp("missed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  unique("unique_chore_instance_per_day").on(t.templateId, t.childId, t.dueDate),
]);

export const insertChoreInstanceSchema = createInsertSchema(choreInstancesTable).omit({ id: true, createdAt: true });
export type InsertChoreInstance = z.infer<typeof insertChoreInstanceSchema>;
export type ChoreInstance = typeof choreInstancesTable.$inferSelect;

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
  fulfilledByParentId: integer("fulfilled_by_parent_id").references(() => familyMembersTable.id, { onDelete: "set null" }),
  fulfilledAt: timestamp("fulfilled_at"),
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
  choreInstanceId: integer("chore_instance_id").references(() => choreInstancesTable.id, { onDelete: "set null" }),
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

// ── Streak Milestones ─────────────────────────────────────────────────────────

export const streakMilestonesTable = pgTable("streak_milestones", {
  id: serial("id").primaryKey(),
  days: integer("days").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  emoji: text("emoji").notNull().default("🔥"),
  tier: badgeTierEnum("tier").notNull().default("bronze"),
  bonusPoints: integer("bonus_points").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const insertStreakMilestoneSchema = createInsertSchema(streakMilestonesTable).omit({ id: true });
export type InsertStreakMilestone = z.infer<typeof insertStreakMilestoneSchema>;
export type StreakMilestone = typeof streakMilestonesTable.$inferSelect;

// ── Point Milestones ──────────────────────────────────────────────────────────

export const pointMilestonesTable = pgTable("point_milestones", {
  id: serial("id").primaryKey(),
  threshold: integer("threshold").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  emoji: text("emoji").notNull().default("⭐"),
  tier: badgeTierEnum("tier").notNull().default("bronze"),
  bonusPoints: integer("bonus_points").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const insertPointMilestoneSchema = createInsertSchema(pointMilestonesTable).omit({ id: true });
export type InsertPointMilestone = z.infer<typeof insertPointMilestoneSchema>;
export type PointMilestone = typeof pointMilestonesTable.$inferSelect;

// ── Chore Milestones ──────────────────────────────────────────────────────────

export const choreMilestonesTable = pgTable("chore_milestones", {
  id: serial("id").primaryKey(),
  threshold: integer("threshold").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  emoji: text("emoji").notNull().default("🎯"),
  tier: badgeTierEnum("tier").notNull().default("bronze"),
  bonusPoints: integer("bonus_points").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const insertChoreMilestoneSchema = createInsertSchema(choreMilestonesTable).omit({ id: true });
export type InsertChoreMilestone = z.infer<typeof insertChoreMilestoneSchema>;
export type ChoreMilestone = typeof choreMilestonesTable.$inferSelect;

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
  googleCalendarConnectionId: text("google_calendar_connection_id"),
  googleRefreshToken: text("google_refresh_token"),
  weatherCity: text("weather_city"),
  screensaverTimeout: integer("screensaver_timeout").notNull().default(5),
  screensaverPhotoInterval: integer("screensaver_photo_interval").notNull().default(15),
});

// ── Screensaver Photos ────────────────────────────────────────────────────────

export const screensaverPhotosTable = pgTable("screensaver_photos", {
  id: serial("id").primaryKey(),
  url: text("url").notNull(),
  filename: text("filename"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertScreensaverPhotoSchema = createInsertSchema(screensaverPhotosTable).omit({ id: true, createdAt: true });
export type InsertScreensaverPhoto = z.infer<typeof insertScreensaverPhotoSchema>;
export type ScreensaverPhoto = typeof screensaverPhotosTable.$inferSelect;

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
