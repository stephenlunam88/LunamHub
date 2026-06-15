// Dashboard route
// Returns a single aggregated summary of today's data for the main display

import { Router } from "express";
import { db } from "@workspace/db";
import {
  eventsTable,
  eventMembersTable,
  choreInstancesTable,
  familyMembersTable,
  mealPlanTable,
  mealsTable,
  redemptionsTable,
} from "@workspace/db";
import { eq, gte, inArray, and } from "drizzle-orm";
import { pointTransactionsTable } from "@workspace/db";

const router = Router();

function today() {
  return new Date().toISOString().split("T")[0]!; // YYYY-MM-DD
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0]!;
}

// GET /api/dashboard/summary
router.get("/summary", async (_req, res) => {
  const todayStr = today();
  const upcomingEnd = addDays(todayStr, 7);

  // Fetch all events for today and upcoming week
  const allEvents = await db
    .select()
    .from(eventsTable)
    .where(gte(eventsTable.date, todayStr))
    .orderBy(eventsTable.date);

  // Get member assignments for those events
  const eventIds = allEvents.map((e) => e.id);
  const memberMap: Record<number, number[]> = {};
  if (eventIds.length > 0) {
    const rows = await db.select().from(eventMembersTable).where(inArray(eventMembersTable.eventId, eventIds));
    for (const r of rows) {
      if (!memberMap[r.eventId]) memberMap[r.eventId] = [];
      memberMap[r.eventId]!.push(r.memberId);
    }
  }

  const formatEvent = (e: typeof eventsTable.$inferSelect) => ({
    id: e.id,
    title: e.title,
    description: e.description ?? null,
    date: e.date,
    startTime: e.startTime ?? null,
    endTime: e.endTime ?? null,
    allDay: e.allDay,
    category: e.category,
    assignedMembers: memberMap[e.id] ?? [],
    createdAt: e.createdAt.toISOString(),
  });

  const todayEvents = allEvents.filter((e) => e.date === todayStr).map(formatEvent);
  const upcomingEvents = allEvents.filter((e) => e.date > todayStr && e.date <= upcomingEnd).map(formatEvent);

  // Family members
  const familyMembers = await db.select().from(familyMembersTable).orderBy(familyMembersTable.id);
  const memberById: Record<number, typeof familyMembersTable.$inferSelect> = {};
  for (const m of familyMembers) memberById[m.id] = m;

  // Today's chore instances — include assignedMember for display
  const todayInstances = await db
    .select()
    .from(choreInstancesTable)
    .where(eq(choreInstancesTable.dueDate, todayStr));

  const todayChores = todayInstances.map((i) => {
    const m = i.childId ? memberById[i.childId] : undefined;
    return {
      id: i.id,
      templateId: i.templateId ?? null,
      title: i.title,
      description: null as string | null,
      assignedTo: i.childId ?? null,
      assignedMember: m
        ? {
            id: m.id, name: m.name, emoji: m.emoji, color: m.color, role: m.role,
            pointsBalance: m.pointsBalance, lifetimePoints: m.lifetimePoints,
            avatarUrl: m.avatarUrl ?? null, hasPin: !!m.pinHash,
            createdAt: m.createdAt.toISOString(),
          }
        : undefined,
      dueDate: i.dueDate,
      repeatType: i.repeatType,
      pointsValue: i.pointsValue,
      status: i.status,
      pointsAwarded: i.pointsAwarded,
      completedAt: i.completedAt?.toISOString() ?? null,
      approvedAt: i.approvedAt?.toISOString() ?? null,
      createdAt: i.createdAt.toISOString(),
    };
  });

  const pendingApprovals = todayInstances.filter((i) => i.status === "pending_approval").length;

  const formattedMembers = familyMembers.map((m) => ({
    id: m.id,
    name: m.name,
    emoji: m.emoji,
    color: m.color,
    role: m.role,
    pointsBalance: m.pointsBalance,
    lifetimePoints: m.lifetimePoints,
    avatarUrl: m.avatarUrl ?? null,
    hasPin: !!m.pinHash,
    createdAt: m.createdAt.toISOString(),
  }));

  // Weekly leaderboard — sum chore_earned transactions this week (Mon–Sun)
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + (weekStart.getDay() === 0 ? -6 : 1));
  const weeklyTx = await db
    .select()
    .from(pointTransactionsTable)
    .where(and(gte(pointTransactionsTable.createdAt, weekStart)));

  const weeklyByMember: Record<number, number> = {};
  for (const tx of weeklyTx) {
    if (tx.type === "chore_earned") {
      weeklyByMember[tx.memberId] = (weeklyByMember[tx.memberId] ?? 0) + tx.amount;
    }
  }
  const weeklyLeaderboard = familyMembers
    .filter((m) => m.role === "child")
    .map((m) => ({ memberId: m.id, name: m.name, emoji: m.emoji, color: m.color, avatarUrl: m.avatarUrl ?? null, weeklyPoints: weeklyByMember[m.id] ?? 0 }))
    .sort((a, b) => b.weeklyPoints - a.weeklyPoints)
    .map((entry, i) => ({ ...entry, rank: i + 1 }));

  // Today's meals from meal plan
  const todayMealPlan = await db.select().from(mealPlanTable).where(eq(mealPlanTable.date, todayStr));
  const todayMeals = await Promise.all(
    todayMealPlan.map(async (mp) => {
      const [meal] = await db.select().from(mealsTable).where(eq(mealsTable.id, mp.mealId));
      return {
        id: mp.id,
        mealId: mp.mealId,
        meal: meal
          ? { id: meal.id, name: meal.name, notes: meal.notes ?? null, ingredients: meal.ingredients ?? null, createdAt: meal.createdAt.toISOString() }
          : undefined,
        date: mp.date,
        mealType: mp.mealType,
      };
    }),
  );

  // Pending reward redemptions
  const allRedemptions = await db.select().from(redemptionsTable);
  const pendingRedemptions = allRedemptions.filter((r) => r.status === "pending").length;

  res.json({
    todayEvents,
    upcomingEvents,
    todayChores,
    pendingApprovals,
    familyMembers: formattedMembers,
    todayMeals,
    pendingRedemptions,
    weeklyLeaderboard,
  });
});

export { router as dashboardRouter };
