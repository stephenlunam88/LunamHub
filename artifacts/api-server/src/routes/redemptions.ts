// Redemption routes — mounted at /api/redemptions
// Children request reward redemptions; parents approve or reject

import { Router } from "express";
import { db } from "@workspace/db";
import { redemptionsTable, rewardsTable, familyMembersTable, pointTransactionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { formatReward } from "./rewards";
import {
  RequestRedemptionBody,
  ApproveRedemptionParams,
  RejectRedemptionParams,
} from "@workspace/api-zod";
import { z } from "zod";
import bcrypt from "bcrypt";

const RedemptionApproveBodySchema = z.object({
  parentId: z.number().int().positive().optional(),
  pin: z.string().optional(),
});

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
      ? {
          id: member.id, name: member.name, emoji: member.emoji, color: member.color, role: member.role,
          pointsBalance: member.pointsBalance, lifetimePoints: member.lifetimePoints,
          avatarUrl: member.avatarUrl ?? null, hasPin: !!member.pinHash, createdAt: member.createdAt.toISOString(),
        }
      : undefined,
    pointsCost: r.pointsCost,
    status: r.status,
    approvedByParentId: r.approvedByParentId ?? null,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

// GET /api/redemptions
router.get("/", async (_req, res) => {
  const redemptions = await db.select().from(redemptionsTable).orderBy(redemptionsTable.createdAt);
  const result = await Promise.all(redemptions.map(formatRedemption));
  res.json(result);
});

// POST /api/redemptions — store pointsCost at request time for audit trail
router.post("/", async (req, res) => {
  const body = RequestRedemptionBody.parse(req.body);
  const [reward] = await db.select().from(rewardsTable).where(eq(rewardsTable.id, body.rewardId));
  const pointsCost = reward?.pointsCost ?? 0;
  const [redemption] = await db.insert(redemptionsTable).values({ ...body, pointsCost }).returning();
  res.status(201).json(await formatRedemption(redemption));
});

async function verifyParentPin(parentId: number | null, pin: string | null, res: import("express").Response): Promise<{ ok: true; parent: typeof familyMembersTable.$inferSelect | null } | { ok: false }> {
  const allParents = await db.select().from(familyMembersTable)
    .where(eq(familyMembersTable.role, "parent"));
  if (allParents.length > 0) {
    if (!parentId) { res.status(403).json({ error: "A parent must approve this action" }); return { ok: false }; }
    const parent = allParents.find(p => p.id === parentId);
    if (!parent) { res.status(403).json({ error: "Parent not found" }); return { ok: false }; }
    if (parent.pinHash) {
      if (!pin) { res.status(403).json({ error: "PIN required for this parent" }); return { ok: false }; }
      const valid = await bcrypt.compare(pin, parent.pinHash);
      if (!valid) { res.status(403).json({ error: "Invalid PIN" }); return { ok: false }; }
    }
    return { ok: true, parent };
  }
  return { ok: true, parent: null };
}

// POST /api/redemptions/:id/approve — deducts points_balance + records transaction
router.post("/:id/approve", async (req, res) => {
  const { id } = ApproveRedemptionParams.parse({ id: Number(req.params.id) });
  const bodyParse = RedemptionApproveBodySchema.safeParse(req.body);
  const parentId = bodyParse.success ? (bodyParse.data.parentId ?? null) : null;
  const pin = bodyParse.success ? (bodyParse.data.pin ?? null) : null;

  const auth = await verifyParentPin(parentId, pin, res);
  if (!auth.ok) return;

  const [redemption] = await db.select().from(redemptionsTable).where(eq(redemptionsTable.id, id));
  if (!redemption) { res.status(404).json({ error: "Not found" }); return; }

  const [reward] = await db.select().from(rewardsTable).where(eq(rewardsTable.id, redemption.rewardId));
  const now = new Date();
  const [updated] = await db
    .update(redemptionsTable)
    .set({ status: "approved", approvedByParentId: parentId, approvedAt: now })
    .where(eq(redemptionsTable.id, id))
    .returning();

  const cost = redemption.pointsCost || reward?.pointsCost || 0;
  if (cost > 0) {
    await db
      .update(familyMembersTable)
      .set({ pointsBalance: sql`${familyMembersTable.pointsBalance} - ${cost}` })
      .where(eq(familyMembersTable.id, redemption.memberId));

    await db.insert(pointTransactionsTable).values({
      memberId: redemption.memberId,
      amount: -cost,
      type: "reward_spent",
      description: `Redeemed: ${reward?.title ?? "reward"}`,
      redemptionId: redemption.id,
    });
  }
  res.json(await formatRedemption(updated));
});

// POST /api/redemptions/:id/reject — also requires parent PIN
router.post("/:id/reject", async (req, res) => {
  const { id } = RejectRedemptionParams.parse({ id: Number(req.params.id) });
  const bodyParse = RedemptionApproveBodySchema.safeParse(req.body);
  const parentId = bodyParse.success ? (bodyParse.data.parentId ?? null) : null;
  const pin = bodyParse.success ? (bodyParse.data.pin ?? null) : null;

  const auth = await verifyParentPin(parentId, pin, res);
  if (!auth.ok) return;

  const [updated] = await db
    .update(redemptionsTable)
    .set({ status: "rejected", approvedByParentId: parentId })
    .where(eq(redemptionsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(await formatRedemption(updated));
});

export { router as redemptionsRouter };
