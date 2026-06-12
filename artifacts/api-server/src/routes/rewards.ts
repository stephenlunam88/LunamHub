// Rewards routes — mounted at /api/rewards
// Parents create rewards; children browse and request redemptions
// Mutations (create, update, delete) require parent PIN verification.

import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "@workspace/db";
import { rewardsTable, familyMembersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
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

async function requireParentPin(req: Request, res: Response): Promise<boolean> {
  const allParents = await db
    .select()
    .from(familyMembersTable)
    .where(eq(familyMembersTable.role, "parent"));

  if (allParents.length === 0) return true; // no parents yet — allow unrestricted

  const rawBody = req.body as { parentId?: unknown; pin?: unknown };
  const parentId = typeof rawBody.parentId === "number" ? rawBody.parentId : undefined;
  const pin = typeof rawBody.pin === "string" ? rawBody.pin : undefined;

  if (!parentId) {
    res.status(403).json({ error: "A parent must authorise this action" });
    return false;
  }
  const parent = allParents.find(p => p.id === parentId);
  if (!parent) {
    res.status(403).json({ error: "Parent not found" });
    return false;
  }
  if (!parent.pinHash) {
    res.status(403).json({ error: "No PIN configured for this parent. Set a PIN in Admin first." });
    return false;
  }
  if (!pin) {
    res.status(403).json({ error: "PIN required" });
    return false;
  }
  const valid = await bcrypt.compare(pin, parent.pinHash);
  if (!valid) {
    res.status(403).json({ error: "Invalid PIN" });
    return false;
  }
  return true;
}

// GET /api/rewards
router.get("/", async (_req, res) => {
  const rewards = await db.select().from(rewardsTable).orderBy(rewardsTable.createdAt);
  res.json(rewards.map(formatReward));
});

// POST /api/rewards — PIN-gated
router.post("/", async (req, res) => {
  if (!await requireParentPin(req, res)) return;
  const body = CreateRewardBody.parse(req.body);
  const [reward] = await db.insert(rewardsTable).values(body).returning();
  res.status(201).json(formatReward(reward));
});

// PATCH /api/rewards/:id — PIN-gated
router.patch("/:id", async (req, res) => {
  if (!await requireParentPin(req, res)) return;
  const { id } = UpdateRewardParams.parse({ id: Number(req.params.id) });
  const body = UpdateRewardBody.parse(req.body);
  const [reward] = await db.update(rewardsTable).set(body).where(eq(rewardsTable.id, id)).returning();
  if (!reward) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatReward(reward));
});

// DELETE /api/rewards/:id — PIN-gated
router.delete("/:id", async (req, res) => {
  if (!await requireParentPin(req, res)) return;
  const { id } = DeleteRewardParams.parse({ id: Number(req.params.id) });
  await db.delete(rewardsTable).where(eq(rewardsTable.id, id));
  res.status(204).send();
});

export { router as rewardsRouter };
