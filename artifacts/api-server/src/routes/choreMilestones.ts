// Chore Milestones routes — mounted at /api/chore-milestones
import { Router } from "express";
import { db } from "@workspace/db";
import { choreMilestonesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const DEFAULT_MILESTONES = [
  { threshold: 1,   title: "First Chore",    emoji: "🎯",  tier: "bronze" as const, bonusPoints: 5,   description: "Completed first chore",  active: true },
  { threshold: 10,  title: "Hard Worker",    emoji: "💪",  tier: "silver" as const, bonusPoints: 15,  description: "Completed 10 chores",   active: true },
  { threshold: 25,  title: "Chore Champion", emoji: "🏆",  tier: "gold"   as const, bonusPoints: 30,  description: "Completed 25 chores",   active: true },
  { threshold: 50,  title: "Chore Legend",   emoji: "👑",  tier: "gold"   as const, bonusPoints: 50,  description: "Completed 50 chores",   active: true },
  { threshold: 100, title: "Century Hero",   emoji: "🌠",  tier: "gold"   as const, bonusPoints: 100, description: "Completed 100 chores",  active: true },
];

function fmt(m: typeof choreMilestonesTable.$inferSelect) {
  return {
    id: m.id,
    threshold: m.threshold,
    title: m.title,
    description: m.description ?? null,
    emoji: m.emoji,
    tier: m.tier,
    bonusPoints: m.bonusPoints,
    active: m.active,
  };
}

const BodySchema = z.object({
  threshold: z.number().int().positive(),
  title: z.string().min(1),
  description: z.string().optional(),
  emoji: z.string().optional(),
  tier: z.enum(["bronze", "silver", "gold"]).optional(),
  bonusPoints: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

// GET /api/chore-milestones
router.get("/", async (_req, res) => {
  let milestones = await db.select().from(choreMilestonesTable).orderBy(asc(choreMilestonesTable.threshold));
  if (milestones.length === 0) {
    milestones = await db.insert(choreMilestonesTable).values(DEFAULT_MILESTONES).returning();
    milestones.sort((a, b) => a.threshold - b.threshold);
  }
  res.json(milestones.map(fmt));
});

// POST /api/chore-milestones
router.post("/", async (req, res) => {
  const body = BodySchema.parse(req.body);
  const [m] = await db.insert(choreMilestonesTable).values(body).returning();
  res.status(201).json(fmt(m!));
});

// PUT /api/chore-milestones/:id
router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const body = BodySchema.parse(req.body);
  const [m] = await db.update(choreMilestonesTable).set(body).where(eq(choreMilestonesTable.id, id)).returning();
  if (!m) { res.status(404).json({ error: "Not found" }); return; }
  res.json(fmt(m));
});

// DELETE /api/chore-milestones/:id
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(choreMilestonesTable).where(eq(choreMilestonesTable.id, id));
  res.status(204).send();
});

export { router as choreMilestonesRouter };
