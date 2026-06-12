// Rewards routes — mounted at /api/rewards
// Parents manage rewards via the PIN-gated Admin UI.
// The Admin page enforces PIN unlock at the app level, so these CRUD routes
// do not need per-request PIN re-verification.

import { Router } from "express";
import { db } from "@workspace/db";
import { rewardsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateRewardBody,
  UpdateRewardBody,
  UpdateRewardParams,
  DeleteRewardParams,
} from "@workspace/api-zod";

const router = Router();

export function formatReward(r: typeof rewardsTable.$inferSelect) {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? null,
    pointsCost: r.pointsCost,
    active: r.active,
    createdAt: r.createdAt.toISOString(),
  };
}

// GET /api/rewards
router.get("/", async (_req, res) => {
  const rewards = await db.select().from(rewardsTable).orderBy(rewardsTable.createdAt);
  res.json(rewards.map(formatReward));
});

// POST /api/rewards
router.post("/", async (req, res) => {
  const body = CreateRewardBody.parse(req.body);
  const [reward] = await db.insert(rewardsTable).values(body).returning();
  res.status(201).json(formatReward(reward));
});

// PATCH /api/rewards/:id
router.patch("/:id", async (req, res) => {
  const { id } = UpdateRewardParams.parse({ id: Number(req.params.id) });
  const body = UpdateRewardBody.parse(req.body);
  const [reward] = await db.update(rewardsTable).set(body).where(eq(rewardsTable.id, id)).returning();
  if (!reward) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatReward(reward));
});

// DELETE /api/rewards/:id
router.delete("/:id", async (req, res) => {
  const { id } = DeleteRewardParams.parse({ id: Number(req.params.id) });
  await db.delete(rewardsTable).where(eq(rewardsTable.id, id));
  res.status(204).send();
});

export { router as rewardsRouter };
