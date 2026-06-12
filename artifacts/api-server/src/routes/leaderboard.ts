// Leaderboard routes — all-time and weekly rankings for child members
import { Router } from "express";
import { db } from "@workspace/db";
import { familyMembersTable, pointTransactionsTable } from "@workspace/db";
import { eq, gte, and } from "drizzle-orm";

const router = Router();

function weekStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  // Monday-based week
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

// GET /api/leaderboard — all-time by lifetimePoints (children only)
router.get("/", async (_req, res) => {
  const members = await db.select().from(familyMembersTable)
    .where(eq(familyMembersTable.role, "child"));
  const ranked = [...members]
    .sort((a, b) => b.lifetimePoints - a.lifetimePoints)
    .map((m, i) => ({
      rank: i + 1,
      memberId: m.id,
      name: m.name,
      emoji: m.emoji,
      color: m.color,
      avatarUrl: m.avatarUrl ?? null,
      lifetimePoints: m.lifetimePoints,
      pointsBalance: m.pointsBalance,
    }));
  res.json(ranked);
});

// GET /api/leaderboard/weekly — points earned this Mon–now (children only)
router.get("/weekly", async (_req, res) => {
  const members = await db.select().from(familyMembersTable)
    .where(eq(familyMembersTable.role, "child"));

  const txns = await db.select().from(pointTransactionsTable)
    .where(and(gte(pointTransactionsTable.createdAt, weekStart())));

  const weeklyByMember: Record<number, number> = {};
  for (const tx of txns) {
    if (tx.type === "chore_earned") {
      weeklyByMember[tx.memberId] = (weeklyByMember[tx.memberId] ?? 0) + tx.amount;
    }
  }

  const ranked = members
    .map(m => ({
      memberId: m.id,
      name: m.name,
      emoji: m.emoji,
      color: m.color,
      avatarUrl: m.avatarUrl ?? null,
      weeklyPoints: weeklyByMember[m.id] ?? 0,
    }))
    .sort((a, b) => b.weeklyPoints - a.weeklyPoints)
    .map((entry, i) => ({ ...entry, rank: i + 1 }));

  res.json(ranked);
});

export { router as leaderboardRouter };
