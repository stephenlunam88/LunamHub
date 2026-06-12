// Chore routes — mounted at /api/chores
// Handles chore CRUD, child completion, parent approval, and summary aggregates

import { Router } from "express";
import { db } from "@workspace/db";
import { choresTable, familyMembersTable, pointTransactionsTable, badgesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
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

// POST /api/chores
router.post("/", async (req, res) => {
  const body = CreateChoreBody.parse(req.body);
  const [chore] = await db.insert(choresTable).values(body).returning();
  res.status(201).json(formatChore(chore, await getMemberById(chore.assignedTo)));
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

  // Server-side PIN validation: if parentId given, check parent's PIN if they have one set
  if (parentId) {
    const [parent] = await db.select().from(familyMembersTable).where(eq(familyMembersTable.id, parentId));
    if (!parent || parent.role !== "parent") { res.status(403).json({ error: "Parent not found" }); return; }
    if (parent.pinHash) {
      if (!pin) { res.status(403).json({ error: "PIN required for this parent" }); return; }
      const valid = await bcrypt.compare(pin, parent.pinHash);
      if (!valid) { res.status(403).json({ error: "Invalid PIN" }); return; }
    }
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
    });

    const [member] = await db.select().from(familyMembersTable).where(eq(familyMembersTable.id, chore.assignedTo));
    if (member) await checkAndAwardBadges(member.id, member.lifetimePoints);
  }

  res.json(formatChore(updated, await getMemberById(updated.assignedTo)));
});

async function checkAndAwardBadges(memberId: number, lifetimePoints: number) {
  const milestones = [
    { threshold: 50,   emoji: "⭐",  title: "First Steps",    tier: "bronze" as const, description: "Earned 50 lifetime points" },
    { threshold: 100,  emoji: "🌟",  title: "Star Chorer",    tier: "bronze" as const, description: "Earned 100 lifetime points" },
    { threshold: 250,  emoji: "🥈",  title: "Silver Streak",  tier: "silver" as const, description: "Earned 250 lifetime points" },
    { threshold: 500,  emoji: "🥇",  title: "Gold Champion",  tier: "gold"   as const, description: "Earned 500 lifetime points" },
    { threshold: 1000, emoji: "💎",  title: "Diamond Legend", tier: "gold"   as const, description: "Earned 1000 lifetime points" },
  ];

  const existing = await db.select().from(badgesTable).where(eq(badgesTable.memberId, memberId));
  const existingTitles = new Set(existing.map((b) => b.title));

  for (const m of milestones) {
    if (lifetimePoints >= m.threshold && !existingTitles.has(m.title)) {
      await db.insert(badgesTable).values({ memberId, title: m.title, description: m.description, emoji: m.emoji, tier: m.tier });
    }
  }
}

export { router as choresRouter };
