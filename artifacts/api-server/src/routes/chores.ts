// Chore routes — mounted at /api/chores
// Handles chore CRUD, child completion, parent approval, and summary aggregates

import { Router } from "express";
import { db } from "@workspace/db";
import { choresTable, familyMembersTable, pointTransactionsTable, badgesTable } from "@workspace/db";
import { eq, sql, count } from "drizzle-orm";
import {
  CreateChoreBody,
  UpdateChoreBody,
  GetChoreParams,
  UpdateChoreParams,
  DeleteChoreParams,
  CompleteChoreParams,
  ApproveChoreParams,
  ListChoresQueryParams,
} from "@workspace/api-zod";
import { z } from "zod";
import bcrypt from "bcrypt";
import { and, gte } from "drizzle-orm";

const ChoreApproveBodySchema = z.object({
  parentId: z.number().int().positive().optional(),
  pin: z.string().optional(),
});

const router = Router();

async function getMemberById(id: number | null) {
  if (!id) return undefined;
  const [m] = await db.select().from(familyMembersTable).where(eq(familyMembersTable.id, id));
  if (!m) return undefined;
  return {
    id: m.id, name: m.name, emoji: m.emoji, color: m.color, role: m.role,
    pointsBalance: m.pointsBalance, lifetimePoints: m.lifetimePoints,
    avatarUrl: m.avatarUrl ?? null, hasPin: !!m.pinHash, createdAt: m.createdAt.toISOString(),
  };
}

function formatChore(c: typeof choresTable.$inferSelect, member?: object) {
  return {
    id: c.id,
    title: c.title,
    description: c.description ?? null,
    assignedTo: c.assignedTo ?? null,
    assignedMember: member,
    dueDate: c.dueDate ?? null,
    repeatType: c.repeatType,
    pointsValue: c.pointsValue,
    status: c.status,
    completedAt: c.completedAt?.toISOString() ?? null,
    approvedAt: c.approvedAt?.toISOString() ?? null,
    approvedByParentId: c.approvedByParentId ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}

// GET /api/chores/summary — must be before /:id to avoid route conflict
router.get("/summary", async (_req, res) => {
  const members = await db.select().from(familyMembersTable);
  const chores = await db.select().from(choresTable);
  const summary = members.map((m) => {
    const mc = chores.filter((c) => c.assignedTo === m.id);
    return {
      memberId: m.id,
      memberName: m.name,
      memberColor: m.color,
      memberEmoji: m.emoji,
      pending: mc.filter((c) => c.status === "pending").length,
      completed: mc.filter((c) => c.status === "completed").length,
      approved: mc.filter((c) => c.status === "approved").length,
      missed: mc.filter((c) => c.status === "missed").length,
      totalPoints: mc.filter((c) => c.status === "approved").reduce((s, c) => s + c.pointsValue, 0),
    };
  });
  res.json(summary);
});

// GET /api/chores
router.get("/", async (req, res) => {
  const params = ListChoresQueryParams.parse({
    assignedTo: req.query.assignedTo ? Number(req.query.assignedTo) : undefined,
    status: req.query.status,
  });

  let chores = await db.select().from(choresTable).orderBy(choresTable.createdAt);
  if (params.assignedTo != null) chores = chores.filter((c) => c.assignedTo === params.assignedTo);
  if (params.status) chores = chores.filter((c) => c.status === params.status);

  const result = await Promise.all(chores.map(async (c) => formatChore(c, await getMemberById(c.assignedTo))));
  res.json(result);
});

const CreateChoreExtended = z.object({
  title: z.string(),
  description: z.string().optional(),
  assignedTo: z.number().int().positive().optional(),
  assignedToMany: z.array(z.number().int().positive()).optional(),
  dueDate: z.string().optional(),
  repeatType: z.enum(["once", "daily", "weekly"]),
  pointsValue: z.number().int(),
});

// POST /api/chores
router.post("/", async (req, res) => {
  const { assignedToMany, ...baseData } = CreateChoreExtended.parse(req.body);

  // Multi-child: create one row per child
  if (assignedToMany && assignedToMany.length > 0) {
    const rows = await db
      .insert(choresTable)
      .values(assignedToMany.map(childId => ({ ...baseData, assignedTo: childId })))
      .returning();
    const formatted = await Promise.all(rows.map(async c => formatChore(c, await getMemberById(c.assignedTo))));
    res.status(201).json(formatted);
    return;
  }

  // Single-child or unassigned
  const body = CreateChoreBody.parse(req.body);
  const [chore] = await db.insert(choresTable).values(body).returning();
  res.status(201).json([formatChore(chore, await getMemberById(chore.assignedTo))]);
});

// GET /api/chores/:id
router.get("/:id", async (req, res) => {
  const { id } = GetChoreParams.parse({ id: Number(req.params.id) });
  const [chore] = await db.select().from(choresTable).where(eq(choresTable.id, id));
  if (!chore) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatChore(chore, await getMemberById(chore.assignedTo)));
});

// PATCH /api/chores/:id
router.patch("/:id", async (req, res) => {
  const { id } = UpdateChoreParams.parse({ id: Number(req.params.id) });
  const body = UpdateChoreBody.parse(req.body);
  const [chore] = await db.update(choresTable).set(body).where(eq(choresTable.id, id)).returning();
  if (!chore) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatChore(chore, await getMemberById(chore.assignedTo)));
});

// DELETE /api/chores/:id
router.delete("/:id", async (req, res) => {
  const { id } = DeleteChoreParams.parse({ id: Number(req.params.id) });
  await db.delete(choresTable).where(eq(choresTable.id, id));
  res.status(204).send();
});

// POST /api/chores/:id/complete — child marks chore as done
router.post("/:id/complete", async (req, res) => {
  const { id } = CompleteChoreParams.parse({ id: Number(req.params.id) });
  const [chore] = await db
    .update(choresTable)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(choresTable.id, id))
    .returning();
  if (!chore) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatChore(chore, await getMemberById(chore.assignedTo)));
});

// POST /api/chores/:id/approve — parent approves, awards points + records transaction
router.post("/:id/approve", async (req, res) => {
  const { id } = ApproveChoreParams.parse({ id: Number(req.params.id) });
  const bodyParse = ChoreApproveBodySchema.safeParse(req.body);
  const parentId = bodyParse.success ? (bodyParse.data.parentId ?? null) : null;
  const pin = bodyParse.success ? (bodyParse.data.pin ?? null) : null;

  // Mandatory parent gating: if any parents exist in the family, parentId is required
  const allParents = await db.select().from(familyMembersTable)
    .where(eq(familyMembersTable.role, "parent"));
  if (allParents.length > 0) {
    if (!parentId) { res.status(403).json({ error: "A parent must approve this action" }); return; }
    const parent = allParents.find(p => p.id === parentId);
    if (!parent) { res.status(403).json({ error: "Parent not found" }); return; }
    if (!parent.pinHash) {
      res.status(403).json({ error: "This parent has no PIN configured. Set a PIN in Admin before approving." });
      return;
    }
    if (!pin) { res.status(403).json({ error: "PIN required for this parent" }); return; }
    const valid = await bcrypt.compare(pin, parent.pinHash);
    if (!valid) { res.status(403).json({ error: "Invalid PIN" }); return; }
  }

  const [chore] = await db.select().from(choresTable).where(eq(choresTable.id, id));
  if (!chore) { res.status(404).json({ error: "Not found" }); return; }

  const now = new Date();
  const [updated] = await db
    .update(choresTable)
    .set({ status: "approved", approvedAt: now, approvedByParentId: parentId })
    .where(eq(choresTable.id, id))
    .returning();

  if (chore.assignedTo) {
    await db
      .update(familyMembersTable)
      .set({
        pointsBalance: sql`${familyMembersTable.pointsBalance} + ${chore.pointsValue}`,
        lifetimePoints: sql`${familyMembersTable.lifetimePoints} + ${chore.pointsValue}`,
      })
      .where(eq(familyMembersTable.id, chore.assignedTo));

    await db.insert(pointTransactionsTable).values({
      memberId: chore.assignedTo,
      amount: chore.pointsValue,
      type: "chore_earned",
      description: `Earned for: ${chore.title}`,
      choreId: chore.id,
      approvedByParentId: parentId,
    });

    const [member] = await db.select().from(familyMembersTable).where(eq(familyMembersTable.id, chore.assignedTo));
    if (member) await checkAndAwardBadges(member.id, member.lifetimePoints);
  }

  res.json(formatChore(updated, await getMemberById(updated.assignedTo)));
});

function maxConsecutiveDays(sortedDates: string[]): number {
  if (sortedDates.length === 0) return 0;
  let maxStreak = 1;
  let streak = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(sortedDates[i - 1] + "T12:00:00Z").getTime();
    const curr = new Date(sortedDates[i] + "T12:00:00Z").getTime();
    const diffDays = Math.round((curr - prev) / 86400000);
    if (diffDays === 1) {
      streak++;
      if (streak > maxStreak) maxStreak = streak;
    } else if (diffDays > 1) {
      streak = 1;
    }
  }
  return maxStreak;
}

async function checkAndAwardBadges(memberId: number, lifetimePoints: number) {
  // Lifetime-points milestones
  const pointMilestones = [
    { threshold: 50,   emoji: "⭐",  title: "First Steps",    tier: "bronze" as const, description: "Earned 50 lifetime points" },
    { threshold: 100,  emoji: "🌟",  title: "Point Collector", tier: "bronze" as const, description: "Earned 100 lifetime points" },
    { threshold: 500,  emoji: "🥈",  title: "Silver Earner",  tier: "silver" as const, description: "Earned 500 lifetime points" },
    { threshold: 1000, emoji: "🥇",  title: "Gold Champion",  tier: "gold"   as const, description: "Earned 1000 lifetime points" },
  ];

  // Approved-chore-count milestones
  const [{ value: choreCount }] = await db
    .select({ value: count() })
    .from(choresTable)
    .where(sql`${choresTable.assignedTo} = ${memberId} AND ${choresTable.status} = 'approved'`);
  const approvedCount = Number(choreCount ?? 0);

  const choreMilestones = [
    { threshold: 1,   emoji: "🎯", title: "First Chore",    tier: "bronze" as const, description: "Completed first chore" },
    { threshold: 10,  emoji: "💪", title: "Hard Worker",    tier: "silver" as const, description: "Approved 10 chores" },
    { threshold: 25,  emoji: "🏆", title: "Chore Champion", tier: "gold"   as const, description: "Approved 25 chores" },
    { threshold: 50,  emoji: "👑", title: "Chore Legend",   tier: "gold"   as const, description: "Approved 50 chores" },
    { threshold: 100, emoji: "🌠", title: "Century Hero",   tier: "gold"   as const, description: "Approved 100 chores" },
  ];

  // Streak badges: check consecutive days with chore_earned transactions
  const txDates = await db
    .select({ earnedOn: sql<string>`DATE(${pointTransactionsTable.createdAt})` })
    .from(pointTransactionsTable)
    .where(sql`${pointTransactionsTable.memberId} = ${memberId} AND ${pointTransactionsTable.amount} > 0 AND ${pointTransactionsTable.type} = 'chore_earned'`);
  const uniqueDates = [...new Set(txDates.map(t => t.earnedOn))].sort();
  const longestStreak = maxConsecutiveDays(uniqueDates);

  const streakMilestones = [
    { threshold: 7,  emoji: "🔥", title: "7-Day Streak",  tier: "silver" as const, description: "Earned chores 7 days in a row" },
    { threshold: 30, emoji: "🌋", title: "30-Day Streak", tier: "gold"   as const, description: "Earned chores 30 days in a row" },
  ];

  const existing = await db.select().from(badgesTable).where(eq(badgesTable.memberId, memberId));
  const existingTitles = new Set(existing.map((b) => b.title));

  for (const m of pointMilestones) {
    if (lifetimePoints >= m.threshold && !existingTitles.has(m.title)) {
      await db.insert(badgesTable).values({ memberId, title: m.title, description: m.description, emoji: m.emoji, tier: m.tier });
    }
  }
  for (const m of choreMilestones) {
    if (approvedCount >= m.threshold && !existingTitles.has(m.title)) {
      await db.insert(badgesTable).values({ memberId, title: m.title, description: m.description, emoji: m.emoji, tier: m.tier });
    }
  }
  for (const m of streakMilestones) {
    if (longestStreak >= m.threshold && !existingTitles.has(m.title)) {
      await db.insert(badgesTable).values({ memberId, title: m.title, description: m.description, emoji: m.emoji, tier: m.tier });
    }
  }
}

export { router as choresRouter };
