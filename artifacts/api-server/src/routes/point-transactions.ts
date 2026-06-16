// Point transactions routes — mounted at /api/point-transactions
// Audit trail for all point earning and spending events

import { Router } from "express";
import { db } from "@workspace/db";
import { pointTransactionsTable, familyMembersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

const router = Router();

function formatTransaction(t: typeof pointTransactionsTable.$inferSelect) {
  return {
    id: t.id,
    memberId: t.memberId,
    amount: t.amount,
    type: t.type,
    description: t.description,
    choreId: t.choreId ?? null,
    redemptionId: t.redemptionId ?? null,
    createdAt: t.createdAt.toISOString(),
  };
}

const BonusPointsSchema = z.object({
  memberId: z.number().int().positive(),
  amount: z.number().int().min(1),
  reason: z.string().min(1),
});

// GET /api/point-transactions — list all (optional ?memberId= filter)
router.get("/", async (req, res) => {
  const memberId = req.query.memberId ? Number(req.query.memberId) : undefined;
  let txns = await db.select().from(pointTransactionsTable).orderBy(pointTransactionsTable.createdAt);
  if (memberId) txns = txns.filter((t) => t.memberId === memberId);
  res.json(txns.map(formatTransaction));
});

// POST /api/point-transactions — award one-off bonus points to a family member
router.post("/", async (req, res) => {
  const parsed = BonusPointsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Validation error" });
    return;
  }
  const { memberId, amount, reason } = parsed.data;

  const [member] = await db.select().from(familyMembersTable).where(eq(familyMembersTable.id, memberId));
  if (!member) {
    res.status(404).json({ error: "Family member not found" });
    return;
  }

  const [txn] = await db.insert(pointTransactionsTable).values({
    memberId,
    amount,
    type: "bonus",
    description: reason,
  }).returning();

  await db.update(familyMembersTable)
    .set({
      pointsBalance: sql`${familyMembersTable.pointsBalance} + ${amount}`,
      lifetimePoints: sql`${familyMembersTable.lifetimePoints} + ${amount}`,
    })
    .where(eq(familyMembersTable.id, memberId));

  res.status(201).json(formatTransaction(txn));
});

export { router as pointTransactionsRouter };
