// Point transactions routes — mounted at /api/point-transactions
// Audit trail for all point earning and spending events

import { Router } from "express";
import { db } from "@workspace/db";
import { pointTransactionsTable } from "@workspace/db";

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

// GET /api/point-transactions — list all (optional ?memberId= filter)
router.get("/", async (req, res) => {
  const memberId = req.query.memberId ? Number(req.query.memberId) : undefined;
  let txns = await db.select().from(pointTransactionsTable).orderBy(pointTransactionsTable.createdAt);
  if (memberId) txns = txns.filter((t) => t.memberId === memberId);
  res.json(txns.map(formatTransaction));
});

export { router as pointTransactionsRouter };
