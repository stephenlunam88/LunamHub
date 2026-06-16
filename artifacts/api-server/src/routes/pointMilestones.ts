// Point Milestones routes — mounted at /api/point-milestones
import { Router } from "express";
import { db } from "@workspace/db";
import { pointMilestonesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const DEFAULT_MILESTONES = [
  { threshold: 50,   title: "First Steps",     emoji: "⭐",  tier: "bronze" as const, bonusPoints: 5,   description: "Earned 50 lifetime points",   active: true },
  { threshold: 100,  title: "Point Collector", emoji: "🌟",  tier: "bronze" as const, bonusPoints: 10,  description: "Earned 100 lifetime points",  active: true },
  { threshold: 500,  title: "Silver Earner",   emoji: "🥈",  tier: "silver" as const, bonusPoints: 25,  description: "Earned 500 lifetime points",  active: true },
  { threshold: 1000, title: "Gold Champion",   emoji: "🥇",  tier: "gold"   as const, bonusPoints: 50,  description: "Earned 1000 lifetime points", active: true },
];

function fmt(m: typeof pointMilestonesTable.$inferSelect) {
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

// GET /api/point-milestones
router.get("/", async (_req, res) => {
  let milestones = await db.select().from(pointMilestonesTable).orderBy(asc(pointMilestonesTable.threshold));
  if (milestones.length === 0) {
    milestones = await db.insert(pointMilestonesTable).values(DEFAULT_MILESTONES).returning();
    milestones.sort((a, b) => a.threshold - b.threshold);
  }
  res.json(milestones.map(fmt));
});

// POST /api/point-milestones
router.post("/", async (req, res) => {
  const body = BodySchema.parse(req.body);
  const [m] = await db.insert(pointMilestonesTable).values(body).returning();
  res.status(201).json(fmt(m!));
});

// PUT /api/point-milestones/:id
router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const body = BodySchema.parse(req.body);
  const [m] = await db.update(pointMilestonesTable).set(body).where(eq(pointMilestonesTable.id, id)).returning();
  if (!m) { res.status(404).json({ error: "Not found" }); return; }
  res.json(fmt(m));
});

// DELETE /api/point-milestones/:id
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(pointMilestonesTable).where(eq(pointMilestonesTable.id, id));
  res.status(204).send();
});

export { router as pointMilestonesRouter };
