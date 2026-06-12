// Badges routes — mounted at /api/badges
// Award and list achievement badges for family members

import { Router } from "express";
import { db } from "@workspace/db";
import { badgesTable, familyMembersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = Router();

function formatBadge(b: typeof badgesTable.$inferSelect) {
  return {
    id: b.id,
    memberId: b.memberId,
    title: b.title,
    description: b.description ?? null,
    emoji: b.emoji,
    tier: b.tier,
    awardedAt: b.awardedAt.toISOString(),
  };
}

const CreateBadgeBody = z.object({
  memberId: z.number().int().positive(),
  title: z.string().min(1),
  description: z.string().optional(),
  emoji: z.string().optional(),
  tier: z.enum(["bronze", "silver", "gold"]).optional(),
});

const DeleteBadgeParams = z.object({ id: z.number().int().positive() });

// GET /api/badges — list all badges (optional ?memberId= filter)
router.get("/", async (req, res) => {
  const memberId = req.query.memberId ? Number(req.query.memberId) : undefined;
  let badges = await db.select().from(badgesTable).orderBy(badgesTable.awardedAt);
  if (memberId) badges = badges.filter((b) => b.memberId === memberId);
  res.json(badges.map(formatBadge));
});

// POST /api/badges — award a badge
router.post("/", async (req, res) => {
  const body = CreateBadgeBody.parse(req.body);
  const [badge] = await db.insert(badgesTable).values(body).returning();
  res.status(201).json(formatBadge(badge));
});

// DELETE /api/badges/:id
router.delete("/:id", async (req, res) => {
  const { id } = DeleteBadgeParams.parse({ id: Number(req.params.id) });
  await db.delete(badgesTable).where(eq(badgesTable.id, id));
  res.status(204).send();
});

export { router as badgesRouter };
