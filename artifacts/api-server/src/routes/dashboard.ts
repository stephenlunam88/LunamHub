// Dashboard route
// Returns a single aggregated summary of today's data for the main display

import { Router } from "express";
import { db } from "@workspace/db";
import {
  eventsTable,
  eventMembersTable,
  choresTable,
  familyMembersTable,
  mealPlanTable,
  mealsTable,
  redemptionsTable,
} from "@workspace/db";
import { eq, gte, lte, inArray } from "drizzle-orm";

const router = Router();

function today() {
  return new Date().toISOString().split("T")[0]; // YYYY-MM-DD
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
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
  let memberMap: Record<number, number[]> = {};
  if (eventIds.length > 0) {
    const rows = await db.select().from(eventMembersTable).where(inArray(eventMembersTable.eventId, eventIds));
    for (const r of rows) {
      if (!memberMap[r.eventId]) memberMap[r.eventId] = [];
      memberMap[r.eventId].push(r.memberId);
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

  // Today's chores (due today or pending)
  const todayChoresRaw = await db
    .select()
    .from(choresTable)
    .where(lte(choresTable.dueDate, todayStr));

  // Also get all pending chores with no due date or daily/weekly
  const pendingChores = await db.select().from(choresTable);

  const todayChores = pendingChores
    .filter((c) => c.status === "pending" && (c.dueDate === todayStr || c.repeatType !== "once" || !c.dueDate))
    .map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description ?? null,
      assignedTo: c.assignedTo ?? null,
      dueDate: c.dueDate ?? null,
      repeatType: c.repeatType,
      pointsValue: c.pointsValue,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
    }));

  // Count pending approvals (chores marked completed but not approved)
  const completedChores = await db.select().from(choresTable);
  const pendingApprovals = completedChores.filter((c) => c.status === "completed").length;

  // Family members
  const familyMembers = await db.select().from(familyMembersTable).orderBy(familyMembersTable.id);
  const formattedMembers = familyMembers.map((m) => ({
    id: m.id,
    name: m.name,
    emoji: m.emoji,
    color: m.color,
    role: m.role,
    pointsBalance: m.pointsBalance,
    createdAt: m.createdAt.toISOString(),
  }));

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
    })
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
  });
});

export { router as dashboardRouter };
