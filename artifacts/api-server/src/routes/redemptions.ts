// Redemption routes — mounted at /api/redemptions
// Children request reward redemptions; parents approve or reject.
// Balance guard: POST checks balance before creating; approve re-checks before deducting.
// Points deducted from pointsBalance (spendable) only — never from lifetimePoints.

import { Router } from "express";
import { db } from "@workspace/db";
import {
  redemptionsTable,
  rewardsTable,
  familyMembersTable,
  pointTransactionsTable,
} from "@workspace/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { formatReward } from "./rewards";
import {
  RequestRedemptionBody,
  ApproveRedemptionParams,
  RejectRedemptionParams,
} from "@workspace/api-zod";
import { z } from "zod";
import bcrypt from "bcrypt";
import {
  clearLoginFailures,
  isLoginBlocked,
  recordLoginFailure,
} from "../lib/loginThrottle";

const RedemptionApproveBodySchema = z.object({
  parentId: z.number().int().positive().optional(),
  pin: z.string().optional(),
});

const router = Router();

async function formatRedemption(r: typeof redemptionsTable.$inferSelect) {
  const [reward] = await db
    .select()
    .from(rewardsTable)
    .where(eq(rewardsTable.id, r.rewardId));
  const [member] = await db
    .select()
    .from(familyMembersTable)
    .where(eq(familyMembersTable.id, r.memberId));
  return {
    id: r.id,
    rewardId: r.rewardId,
    reward: reward ? formatReward(reward) : undefined,
    memberId: r.memberId,
    member: member
      ? {
          id: member.id,
          name: member.name,
          emoji: member.emoji,
          color: member.color,
          role: member.role,
          pointsBalance: member.pointsBalance,
          lifetimePoints: member.lifetimePoints,
          avatarUrl: member.avatarUrl ?? null,
          hasPin: !!member.pinHash,
          createdAt: member.createdAt.toISOString(),
        }
      : undefined,
    pointsCost: r.pointsCost,
    status: r.status,
    approvedByParentId: r.approvedByParentId ?? null,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    fulfilledByParentId: r.fulfilledByParentId ?? null,
    fulfilledAt: r.fulfilledAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

// GET /api/redemptions
router.get("/", async (_req, res) => {
  const redemptions = await db
    .select()
    .from(redemptionsTable)
    .orderBy(redemptionsTable.createdAt);
  const result = await Promise.all(redemptions.map(formatRedemption));
  res.json(result);
});

// POST /api/redemptions — balance guard before creating
router.post("/", async (req, res) => {
  const body = RequestRedemptionBody.parse(req.body);

  const [reward] = await db
    .select()
    .from(rewardsTable)
    .where(eq(rewardsTable.id, body.rewardId));
  if (!reward) {
    res.status(404).json({ error: "Reward not found" });
    return;
  }

  const [member] = await db
    .select()
    .from(familyMembersTable)
    .where(eq(familyMembersTable.id, body.memberId));
  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  if (member.pointsBalance < reward.pointsCost) {
    res.status(422).json({
      error: "You need more points for this reward.",
    });
    return;
  }

  const [redemption] = await db
    .insert(redemptionsTable)
    .values({ ...body, pointsCost: reward.pointsCost })
    .returning();
  res.status(201).json(await formatRedemption(redemption!));
});

async function verifyParentPin(
  parentId: number | null,
  pin: string | null,
  res: import("express").Response,
  clientKey = "unknown",
): Promise<
  | { ok: true; parent: typeof familyMembersTable.$inferSelect | null }
  | { ok: false }
> {
  const allParents = await db
    .select()
    .from(familyMembersTable)
    .where(eq(familyMembersTable.role, "parent"));
  if (allParents.length > 0) {
    if (!parentId) {
      res.status(403).json({ error: "A parent must approve this action" });
      return { ok: false };
    }
    const parent = allParents.find((p) => p.id === parentId);
    if (!parent) {
      res.status(403).json({ error: "Parent not found" });
      return { ok: false };
    }
    if (!parent.pinHash) {
      res
        .status(403)
        .json({
          error:
            "This parent has no PIN configured. Set a PIN in Admin before approving.",
        });
      return { ok: false };
    }
    if (!pin) {
      res.status(403).json({ error: "PIN required for this parent" });
      return { ok: false };
    }
    const throttleKey = `member:${parentId}:${clientKey}`;
    if (isLoginBlocked(throttleKey)) {
      res.status(429).json({ error: "Too many PIN attempts. Try again later." });
      return { ok: false };
    }
    const valid = await bcrypt.compare(pin, parent.pinHash);
    if (!valid) {
      recordLoginFailure(throttleKey);
      res.status(403).json({ error: "Invalid PIN" });
      return { ok: false };
    }
    clearLoginFailures(throttleKey);
    return { ok: true, parent };
  }
  return { ok: true, parent: null };
}

// POST /api/redemptions/:id/approve — re-checks balance; deducts pointsBalance only
router.post("/:id/approve", async (req, res) => {
  const { id } = ApproveRedemptionParams.parse({ id: Number(req.params.id) });
  const bodyParse = RedemptionApproveBodySchema.safeParse(req.body);
  const parentId = bodyParse.success ? (bodyParse.data.parentId ?? null) : null;
  const pin = bodyParse.success ? (bodyParse.data.pin ?? null) : null;

  const auth = await verifyParentPin(parentId, pin, res, req.ip);
  if (!auth.ok) return;

  const outcome = await db
    .transaction(async (tx) => {
      const [redemption] = await tx
        .select()
        .from(redemptionsTable)
        .where(eq(redemptionsTable.id, id));
      if (!redemption) return { kind: "missing" as const };
      if (redemption.status !== "pending")
        return { kind: "unchanged" as const, redemption };

      const [reward] = await tx
        .select()
        .from(rewardsTable)
        .where(eq(rewardsTable.id, redemption.rewardId));
      const cost = redemption.pointsCost || reward?.pointsCost || 0;
      const [updated] = await tx
        .update(redemptionsTable)
        .set({
          status: "approved",
          approvedByParentId: parentId,
          approvedAt: new Date(),
        })
        .where(
          and(
            eq(redemptionsTable.id, id),
            eq(redemptionsTable.status, "pending"),
          ),
        )
        .returning();
      if (!updated) return { kind: "unchanged" as const, redemption };

      if (cost > 0) {
        const [member] = await tx
          .update(familyMembersTable)
          .set({
            pointsBalance: sql`${familyMembersTable.pointsBalance} - ${cost}`,
          })
          .where(
            and(
              eq(familyMembersTable.id, redemption.memberId),
              gte(familyMembersTable.pointsBalance, cost),
            ),
          )
          .returning();
        if (!member) {
          throw new Error("INSUFFICIENT_POINTS");
        }
        await tx.insert(pointTransactionsTable).values({
          memberId: redemption.memberId,
          amount: -cost,
          type: "reward_spent",
          description: `Redeemed: ${reward?.title ?? "reward"}`,
          redemptionId: redemption.id,
        });
      }
      return { kind: "approved" as const, redemption: updated };
    })
    .catch((error: unknown) => {
      if (error instanceof Error && error.message === "INSUFFICIENT_POINTS") {
        return { kind: "insufficient" as const };
      }
      throw error;
    });

  if (outcome.kind === "missing") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (outcome.kind === "insufficient") {
    res.status(422).json({ error: "This child no longer has enough points." });
    return;
  }
  res.json(await formatRedemption(outcome.redemption));
});

// POST /api/redemptions/:id/reject — requires parent PIN; no points deducted
router.post("/:id/reject", async (req, res) => {
  const { id } = RejectRedemptionParams.parse({ id: Number(req.params.id) });
  const bodyParse = RedemptionApproveBodySchema.safeParse(req.body);
  const parentId = bodyParse.success ? (bodyParse.data.parentId ?? null) : null;
  const pin = bodyParse.success ? (bodyParse.data.pin ?? null) : null;

  const auth = await verifyParentPin(parentId, pin, res, req.ip);
  if (!auth.ok) return;

  const [updated] = await db
    .update(redemptionsTable)
    .set({ status: "rejected", approvedByParentId: parentId })
    .where(
      and(eq(redemptionsTable.id, id), eq(redemptionsTable.status, "pending")),
    )
    .returning();
  if (!updated) {
    res.status(409).json({ error: "Only pending redemptions can be rejected" });
    return;
  }
  res.json(await formatRedemption(updated));
});

// POST /api/redemptions/:id/fulfill — parent marks an approved redemption as delivered
router.post("/:id/fulfill", async (req, res) => {
  const id = Number(req.params.id);
  const bodyParse = RedemptionApproveBodySchema.safeParse(req.body);
  const parentId = bodyParse.success ? (bodyParse.data.parentId ?? null) : null;
  const pin = bodyParse.success ? (bodyParse.data.pin ?? null) : null;

  const auth = await verifyParentPin(parentId, pin, res, req.ip);
  if (!auth.ok) return;

  const [redemption] = await db
    .select()
    .from(redemptionsTable)
    .where(eq(redemptionsTable.id, id));
  if (!redemption) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (redemption.status !== "approved") {
    res
      .status(400)
      .json({ error: "Only approved redemptions can be marked as fulfilled" });
    return;
  }

  const now = new Date();
  const [updated] = await db
    .update(redemptionsTable)
    .set({
      status: "fulfilled",
      fulfilledByParentId: parentId,
      fulfilledAt: now,
    })
    .where(eq(redemptionsTable.id, id))
    .returning();

  res.json(await formatRedemption(updated!));
});

export { router as redemptionsRouter };
