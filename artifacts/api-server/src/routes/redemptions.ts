// Redemption routes — mounted at /api/redemptions
// Children request reward redemptions; parents approve or reject

import { Router } from "express";
import { db } from "@workspace/db";
import { redemptionsTable, rewardsTable, familyMembersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { formatReward } from "./rewards";
import {
  RequestRedemptionBody,
  ApproveRedemptionParams,
  RejectRedemptionParams,
} from "@workspace/api-zod";

const router = Router();

async function formatRedemption(r: typeof redemptionsTable.$inferSelect) {
  const [reward] = await db.select().from(rewardsTable).where(eq(rewardsTable.id, r.rewardId));
  const [member] = await db.select().from(familyMembersTable).where(eq(familyMembersTable.id, r.memberId));
  return {
    id: r.id,
    rewardId: r.rewardId,
    reward: reward ? formatReward(reward) : undefined,
    memberId: r.memberId,
    member: member
      ? { id: member.id, name: member.name, emoji: member.emoji, color: member.color, role: member.role, pointsBalance: member.pointsBalance, createdAt: member.createdAt.toISOString() }
      : undefined,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  };
}

// GET /api/redemptions
router.get("/", async (_req, res) => {
  const redemptions = await db.select().from(redemptionsTable).orderBy(redemptionsTable.createdAt);
  const result = await Promise.all(redemptions.map(formatRedemption));
  res.json(result);
});

// POST /api/redemptions
router.post("/", async (req, res) => {
  const body = RequestRedemptionBody.parse(req.body);
  const [redemption] = await db.insert(redemptionsTable).values(body).returning();
  res.status(201).json(await formatRedemption(redemption));
});

// POST /api/redemptions/:id/approve
router.post("/:id/approve", async (req, res) => {
  const { id } = ApproveRedemptionParams.parse({ id: Number(req.params.id) });
  const [redemption] = await db.select().from(redemptionsTable).where(eq(redemptionsTable.id, id));
  if (!redemption) { res.status(404).json({ error: "Not found" }); return; }

  const [reward] = await db.select().from(rewardsTable).where(eq(rewardsTable.id, redemption.rewardId));
  const [updated] = await db.update(redemptionsTable).set({ status: "approved" }).where(eq(redemptionsTable.id, id)).returning();

  if (reward) {
    await db
      .update(familyMembersTable)
      .set({ pointsBalance: sql`${familyMembersTable.pointsBalance} - ${reward.pointsCost}` })
      .where(eq(familyMembersTable.id, redemption.memberId));
  }
  res.json(await formatRedemption(updated));
});

// POST /api/redemptions/:id/reject
router.post("/:id/reject", async (req, res) => {
  const { id } = RejectRedemptionParams.parse({ id: Number(req.params.id) });
  const [updated] = await db.update(redemptionsTable).set({ status: "rejected" }).where(eq(redemptionsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(await formatRedemption(updated));
});

export { router as redemptionsRouter };
