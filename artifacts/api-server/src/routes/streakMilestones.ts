// Streak Milestones routes — mounted at /api/streak-milestones
import { Router } from "express";
import { db } from "@workspace/db";
import { streakMilestonesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const DEFAULT_MILESTONES = [
  { days: 3,  title: "3-Day Streak",  emoji: "🔥", tier: "bronze" as const, bonusPoints: 5,  description: "3 days of chores in a row", active: true },
  { days: 7,  title: "7-Day Streak",  emoji: "🔥", tier: "silver" as const, bonusPoints: 15, description: "7 days of chores in a row",  active: true },
  { days: 14, title: "2-Week Streak", emoji: "⚡", tier: "silver" as const, bonusPoints: 30, description: "14 days of chores in a row", active: true },
  { days: 30, title: "30-Day Streak", emoji: "🌋", tier: "gold"   as const, bonusPoints: 75, description: "30 days of chores in a row", active: true },
];

function fmt(m: typeof streakMilestonesTable.$inferSelect) {
  return {
    id: m.id,
    days: m.days,
    title: m.title,
    description: m.description ?? null,
    emoji: m.emoji,
    tier: m.tier,
    bonusPoints: m.bonusPoints,
    active: m.active,
  };
}

const BodySchema = z.object({
  days: z.number().int().positive(),
  title: z.string().min(1),
  description: z.string().optional(),
  emoji: z.string().optional(),
  tier: z.enum(["bronze", "silver", "gold"]).optional(),
  bonusPoints: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

// GET /api/streak-milestones
router.get("/", async (_req, res) => {
  let milestones = await db.select().from(streakMilestonesTable).orderBy(asc(streakMilestonesTable.days));
  // Seed defaults if table is empty
  if (milestones.length === 0) {
    milestones = await db.insert(streakMilestonesTable).values(DEFAULT_MILESTONES).returning();
    milestones.sort((a, b) => a.days - b.days);
  }
  res.json(milestones.map(fmt));
});

// POST /api/streak-milestones
router.post("/", async (req, res) => {
  const body = BodySchema.parse(req.body);
  const [m] = await db.insert(streakMilestonesTable).values(body).returning();
  res.status(201).json(fmt(m!));
});

// PUT /api/streak-milestones/:id
router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const body = BodySchema.parse(req.body);
  const [m] = await db.update(streakMilestonesTable).set(body).where(eq(streakMilestonesTable.id, id)).returning();
  if (!m) { res.status(404).json({ error: "Not found" }); return; }
  res.json(fmt(m));
});

// DELETE /api/streak-milestones/:id
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(streakMilestonesTable).where(eq(streakMilestonesTable.id, id));
  res.status(204).send();
});

export { router as streakMilestonesRouter };
