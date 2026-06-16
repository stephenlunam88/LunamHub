// Chore routes — mounted at /api/chores
// Template/instance model:
//   POST /api/chores          → creates a ChoreTemplate + seeds today's ChoreInstance(s)
//   GET  /api/chores          → generates today's instances (idempotent), returns instances
//   GET  /api/chores/summary  → today-scoped counts per child
//   POST /api/chores/:id/complete → instance status: todo → pending_approval
//   POST /api/chores/:id/approve  → instance status: pending_approval → done + award points (once)
//   POST /api/chores/:id/reject   → instance status: pending_approval → todo (retry allowed)
//   DELETE /api/chores/:id        → deactivates template (hides all instances)

import { Router } from "express";
import { db } from "@workspace/db";
import {
  choreTemplatesTable,
  choreTemplateChildrenTable,
  choreInstancesTable,
  choresTable,
  familyMembersTable,
  pointTransactionsTable,
  badgesTable,
  streakMilestonesTable,
} from "@workspace/db";
import { eq, sql, lt, and, count, inArray } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcrypt";

const ChoreApproveBodySchema = z.object({
  parentId: z.number().int().positive().optional(),
  pin: z.string().optional(),
});

const ChoreRejectBodySchema = z.object({
  parentId: z.number().int().positive().optional(),
  pin: z.string().optional(),
  markAsMissed: z.boolean().optional(),
});

const CreateChoreSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  assignedTo: z.number().int().positive().optional(),
  assignedToMany: z.array(z.number().int().positive()).optional(),
  dueDate: z.string().optional(),
  repeatType: z.enum(["once", "daily", "weekly"]),
  pointsValue: z.number().int(),
  // For weekly chores: days of week [0=Sun … 6=Sat]. Defaults to [today's DOW] when omitted.
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
});

const router = Router();

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split("T")[0]!;
}

async function getMemberById(id: number | null | undefined) {
  if (!id) return undefined;
  const [m] = await db.select().from(familyMembersTable).where(eq(familyMembersTable.id, id));
  if (!m) return undefined;
  return formatMember(m);
}

function formatMember(m: typeof familyMembersTable.$inferSelect) {
  return {
    id: m.id, name: m.name, emoji: m.emoji, color: m.color, role: m.role,
    pointsBalance: m.pointsBalance, lifetimePoints: m.lifetimePoints,
    avatarUrl: m.avatarUrl ?? null, hasPin: !!m.pinHash,
    createdAt: m.createdAt.toISOString(),
  };
}

function formatInstance(
  inst: typeof choreInstancesTable.$inferSelect,
  member?: object,
) {
  return {
    id: inst.id,
    templateId: inst.templateId ?? null,
    title: inst.title,
    description: null as string | null,
    assignedTo: inst.childId ?? null,
    assignedMember: member,
    dueDate: inst.dueDate,
    repeatType: inst.repeatType,
    pointsValue: inst.pointsValue,
    status: inst.status,
    pointsAwarded: inst.pointsAwarded,
    completedAt: inst.completedAt?.toISOString() ?? null,
    approvedAt: inst.approvedAt?.toISOString() ?? null,
    approvedByParentId: inst.approvedByParentId ?? null,
    missedAt: inst.missedAt?.toISOString() ?? null,
    createdAt: inst.createdAt.toISOString(),
  };
}

// ── Per-row idempotent migration: chores → templates + instances ───────────────

let migrationDone = false;

async function runMigrationIfNeeded() {
  if (migrationDone) return;
  migrationDone = true;

  const oldChores = await db.select().from(choresTable);
  if (oldChores.length === 0) return;

  // Find which legacy chore IDs already have a corresponding template
  const existingMigrated = await db
    .select({ legacyChoreId: choreTemplatesTable.legacyChoreId })
    .from(choreTemplatesTable)
    .where(sql`${choreTemplatesTable.legacyChoreId} IS NOT NULL`);
  const migratedIds = new Set(existingMigrated.map((r) => r.legacyChoreId).filter(Boolean) as number[]);

  const toMigrate = oldChores.filter((c) => !migratedIds.has(c.id));
  if (toMigrate.length === 0) return;

  const today = todayStr();

  for (const c of toMigrate) {
    const [template] = await db
      .insert(choreTemplatesTable)
      .values({
        title: c.title,
        description: c.description,
        pointsValue: c.pointsValue,
        repeatType: c.repeatType,
        requiresApproval: true,
        active: true,
        legacyChoreId: c.id,
        createdAt: c.createdAt,
      })
      .returning();

    if (!template) continue;

    if (c.assignedTo) {
      await db.insert(choreTemplateChildrenTable).values({
        templateId: template.id,
        childId: c.assignedTo,
      }).onConflictDoNothing();

      const instanceStatus =
        c.status === "approved" ? "done" :
        c.status === "completed" ? "pending_approval" :
        c.status === "missed" ? "missed" : "todo";

      // For resolved chores, preserve their original date. For pending/missed,
      // use today so they surface in the current day's flow.
      const isResolved = c.status === "approved" || c.status === "completed" || c.status === "missed";
      const dueDate = isResolved ? (c.dueDate ?? today) : today;
      await db
        .insert(choreInstancesTable)
        .values({
          templateId: template.id,
          childId: c.assignedTo,
          title: c.title,
          pointsValue: c.pointsValue,
          repeatType: c.repeatType,
          dueDate,
          status: instanceStatus as typeof choreInstancesTable.$inferSelect["status"],
          pointsAwarded: c.status === "approved",
          completedAt: c.completedAt ?? undefined,
          approvedAt: c.approvedAt ?? undefined,
          approvedByParentId: c.approvedByParentId ?? undefined,
        })
        .onConflictDoNothing();
    }
  }
}

// ── Daily instance generation ──────────────────────────────────────────────────

async function generateTodayInstances() {
  await runMigrationIfNeeded();

  const today = todayStr();

  // 1. Mark past-due todo instances as missed
  await db
    .update(choreInstancesTable)
    .set({ status: "missed", missedAt: new Date() })
    .where(
      and(
        eq(choreInstancesTable.status, "todo"),
        lt(choreInstancesTable.dueDate, today),
      ),
    );

  // 2. Get all active templates with their child assignments
  const templates = await db
    .select()
    .from(choreTemplatesTable)
    .where(eq(choreTemplatesTable.active, true));

  if (templates.length === 0) return;

  const templateIds = templates.map((t) => t.id);
  const assignments = await db
    .select()
    .from(choreTemplateChildrenTable)
    .where(inArray(choreTemplateChildrenTable.templateId, templateIds));

  const todayDow = new Date().getDay(); // 0=Sun … 6=Sat

  for (const template of templates) {
    if (template.repeatType === "once") continue; // seeded at creation, not regenerated

    const children = assignments
      .filter((a) => a.templateId === template.id)
      .map((a) => a.childId);

    if (children.length === 0) continue;

    if (template.repeatType === "daily") {
      await db
        .insert(choreInstancesTable)
        .values(
          children.map((childId) => ({
            templateId: template.id,
            childId,
            title: template.title,
            pointsValue: template.pointsValue,
            repeatType: "daily" as const,
            dueDate: today,
            status: "todo" as const,
            pointsAwarded: false,
          })),
        )
        .onConflictDoNothing();
    }

    if (template.repeatType === "weekly") {
      // daysOfWeek stored as JSON array, e.g. "[1,3]". Default: day the template was created.
      let targetDays: number[];
      try {
        targetDays = template.daysOfWeek
          ? (JSON.parse(template.daysOfWeek) as number[])
          : [template.createdAt.getDay()];
      } catch {
        targetDays = [template.createdAt.getDay()];
      }
      if (!targetDays.includes(todayDow)) continue;

      await db
        .insert(choreInstancesTable)
        .values(
          children.map((childId) => ({
            templateId: template.id,
            childId,
            title: template.title,
            pointsValue: template.pointsValue,
            repeatType: "weekly" as const,
            dueDate: today,
            status: "todo" as const,
            pointsAwarded: false,
          })),
        )
        .onConflictDoNothing();
    }
  }
}

// ── Parent PIN verification ────────────────────────────────────────────────────

async function verifyParentPin(
  parentId: number | null,
  pin: string | null,
  res: import("express").Response,
): Promise<boolean> {
  const allParents = await db
    .select()
    .from(familyMembersTable)
    .where(eq(familyMembersTable.role, "parent"));

  if (allParents.length === 0) return true;

  if (!parentId) {
    res.status(403).json({ error: "A parent must approve this action" });
    return false;
  }
  const parent = allParents.find((p) => p.id === parentId);
  if (!parent) {
    res.status(403).json({ error: "Parent not found" });
    return false;
  }
  if (!parent.pinHash) {
    res.status(403).json({ error: "This parent has no PIN configured. Set a PIN in Admin before approving." });
    return false;
  }
  if (!pin) {
    res.status(403).json({ error: "PIN required for this parent" });
    return false;
  }
  const valid = await bcrypt.compare(pin, parent.pinHash);
  if (!valid) {
    res.status(403).json({ error: "Invalid PIN" });
    return false;
  }
  return true;
}

// ── GET /api/chores/summary — today-scoped counts per child ───────────────────

router.get("/summary", async (_req, res) => {
  await generateTodayInstances();

  const today = todayStr();
  const members = await db.select().from(familyMembersTable);
  const allInstances = await db.select().from(choreInstancesTable);

  const summary = members.map((m) => {
    const mine = allInstances.filter((i) => i.childId === m.id);
    const todayInstances = mine.filter((i) => i.dueDate === today);
    return {
      memberId: m.id,
      memberName: m.name,
      memberColor: m.color,
      memberEmoji: m.emoji,
      memberAvatarUrl: m.avatarUrl ?? null,
      pointsBalance: m.pointsBalance,
      lifetimePoints: m.lifetimePoints,
      todoPending: todayInstances.filter((i) => i.status === "todo").length,
      pendingApproval: todayInstances.filter((i) => i.status === "pending_approval").length,
      doneToday: todayInstances.filter((i) => i.status === "done").length,
      missedToday: todayInstances.filter((i) => i.status === "missed").length,
      allTimeDone: mine.filter((i) => i.status === "done").length,
      // Legacy fields for backward compat with existing frontend
      pending: todayInstances.filter((i) => i.status === "todo").length,
      completed: todayInstances.filter((i) => i.status === "pending_approval").length,
      approved: mine.filter((i) => i.status === "done").length,
      missed: todayInstances.filter((i) => i.status === "missed").length,
      totalPoints: mine.filter((i) => i.status === "done" && i.pointsAwarded).reduce((s, i) => s + i.pointsValue, 0),
    };
  });

  res.json(summary);
});

// ── GET /api/chores ────────────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  await generateTodayInstances();

  const today = todayStr();
  const assignedTo = req.query.assignedTo ? Number(req.query.assignedTo) : undefined;
  const statusFilter = req.query.status as string | undefined;

  let instances = await db
    .select()
    .from(choreInstancesTable)
    .where(eq(choreInstancesTable.dueDate, today))
    .orderBy(choreInstancesTable.createdAt);

  if (assignedTo != null) instances = instances.filter((i) => i.childId === assignedTo);
  if (statusFilter) instances = instances.filter((i) => i.status === statusFilter);

  const result = await Promise.all(
    instances.map(async (i) => formatInstance(i, await getMemberById(i.childId))),
  );
  res.json(result);
});

// ── POST /api/chores — create template + seed today's instance(s) ──────────────

router.post("/", async (req, res) => {
  await runMigrationIfNeeded();

  const body = CreateChoreSchema.parse(req.body);
  const today = todayStr();

  // For weekly: store caller-supplied daysOfWeek or default to today's DOW
  const daysOfWeekJson =
    body.repeatType === "weekly"
      ? JSON.stringify(body.daysOfWeek ?? [new Date().getDay()])
      : null;

  const [template] = await db
    .insert(choreTemplatesTable)
    .values({
      title: body.title,
      description: body.description,
      pointsValue: body.pointsValue,
      repeatType: body.repeatType,
      daysOfWeek: daysOfWeekJson,
      requiresApproval: true,
      active: true,
    })
    .returning();

  if (!template) {
    res.status(500).json({ error: "Failed to create chore" });
    return;
  }

  // Collect assigned children
  const childIds: number[] = [];
  if (body.assignedToMany && body.assignedToMany.length > 0) {
    childIds.push(...body.assignedToMany);
  } else if (body.assignedTo) {
    childIds.push(body.assignedTo);
  }

  if (childIds.length > 0) {
    await db.insert(choreTemplateChildrenTable).values(
      childIds.map((childId) => ({ templateId: template.id, childId })),
    );
  }

  // Seed initial instance(s):
  //   once: use specified dueDate or today
  //   daily: always today
  //   weekly: only if today is one of the target days; otherwise no instance yet
  const dueDate =
    body.repeatType === "once"
      ? (body.dueDate ?? today)
      : today;

  const todayDow = new Date().getDay();
  let shouldSeedToday = true;
  if (body.repeatType === "weekly") {
    const targetDays = body.daysOfWeek ?? [todayDow];
    shouldSeedToday = targetDays.includes(todayDow);
  }

  if (childIds.length > 0 && shouldSeedToday) {
    await db
      .insert(choreInstancesTable)
      .values(
        childIds.map((childId) => ({
          templateId: template.id,
          childId,
          title: template.title,
          pointsValue: template.pointsValue,
          repeatType: template.repeatType,
          dueDate,
          status: "todo" as const,
          pointsAwarded: false,
        })),
      )
      .onConflictDoNothing();
  }

  const instances = await db
    .select()
    .from(choreInstancesTable)
    .where(eq(choreInstancesTable.templateId, template.id));

  const formatted = await Promise.all(
    instances.map(async (i) => formatInstance(i, await getMemberById(i.childId))),
  );

  res.status(201).json(formatted);
});

// ── PATCH /api/chores/:id — update instance fields; propagates to template ─────

const UpdateChoreSchema = z.object({
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  repeatType: z.enum(["once", "daily", "weekly"]).optional(),
  pointsValue: z.number().int().optional(),
  status: z.enum(["todo", "pending_approval", "done", "missed", "rejected"]).optional(),
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const body = UpdateChoreSchema.parse(req.body);

  const [inst] = await db
    .select()
    .from(choreInstancesTable)
    .where(eq(choreInstancesTable.id, id));
  if (!inst) { res.status(404).json({ error: "Not found" }); return; }

  // Fields that apply to the instance snapshot
  const instanceUpdates: Partial<typeof choreInstancesTable.$inferInsert> = {};
  if (body.title !== undefined) instanceUpdates.title = body.title;
  if (body.pointsValue !== undefined) instanceUpdates.pointsValue = body.pointsValue;
  if (body.dueDate !== undefined) instanceUpdates.dueDate = body.dueDate ?? inst.dueDate;
  if (body.repeatType !== undefined) instanceUpdates.repeatType = body.repeatType;
  if (body.status !== undefined) instanceUpdates.status = body.status;

  const [updated] = await db
    .update(choreInstancesTable)
    .set(instanceUpdates)
    .where(eq(choreInstancesTable.id, id))
    .returning();

  // Propagate title, description, pointsValue, repeatType to the template so
  // future generated instances pick up the changes
  if (inst.templateId && (body.title !== undefined || body.description !== undefined || body.pointsValue !== undefined || body.repeatType !== undefined)) {
    const templateUpdates: Partial<typeof choreTemplatesTable.$inferInsert> = {};
    if (body.title !== undefined) templateUpdates.title = body.title;
    if (body.description !== undefined) templateUpdates.description = body.description;
    if (body.pointsValue !== undefined) templateUpdates.pointsValue = body.pointsValue;
    if (body.repeatType !== undefined) templateUpdates.repeatType = body.repeatType;
    await db
      .update(choreTemplatesTable)
      .set(templateUpdates)
      .where(eq(choreTemplatesTable.id, inst.templateId));
  }

  res.json(formatInstance(updated!, await getMemberById(updated!.childId)));
});

// ── GET /api/chores/:id ────────────────────────────────────────────────────────

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [inst] = await db
    .select()
    .from(choreInstancesTable)
    .where(eq(choreInstancesTable.id, id));
  if (!inst) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatInstance(inst, await getMemberById(inst.childId)));
});

// ── DELETE /api/chores/:id — deactivate template + remove pending instances ────

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [inst] = await db
    .select()
    .from(choreInstancesTable)
    .where(eq(choreInstancesTable.id, id));

  if (inst?.templateId) {
    await db
      .update(choreTemplatesTable)
      .set({ active: false })
      .where(eq(choreTemplatesTable.id, inst.templateId));
    await db
      .delete(choreInstancesTable)
      .where(
        and(
          eq(choreInstancesTable.templateId, inst.templateId),
          eq(choreInstancesTable.status, "todo"),
        ),
      );
  } else if (inst) {
    await db.delete(choreInstancesTable).where(eq(choreInstancesTable.id, id));
  }

  res.status(204).send();
});

// ── POST /api/chores/:id/complete — child marks as done → pending_approval ────

router.post("/:id/complete", async (req, res) => {
  const id = Number(req.params.id);
  const [inst] = await db
    .update(choreInstancesTable)
    .set({ status: "pending_approval", completedAt: new Date() })
    .where(
      and(
        eq(choreInstancesTable.id, id),
        eq(choreInstancesTable.status, "todo"),
      ),
    )
    .returning();

  if (!inst) {
    // Either not found or wrong state — return current
    const [current] = await db.select().from(choreInstancesTable).where(eq(choreInstancesTable.id, id));
    if (!current) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatInstance(current, await getMemberById(current.childId)));
    return;
  }
  res.json(formatInstance(inst, await getMemberById(inst.childId)));
});

// ── POST /api/chores/:id/approve — parent approves; points awarded exactly once ─

router.post("/:id/approve", async (req, res) => {
  const id = Number(req.params.id);
  const bodyParse = ChoreApproveBodySchema.safeParse(req.body);
  const parentId = bodyParse.success ? (bodyParse.data.parentId ?? null) : null;
  const pin = bodyParse.success ? (bodyParse.data.pin ?? null) : null;

  const ok = await verifyParentPin(parentId, pin, res);
  if (!ok) return;

  const now = new Date();

  // Atomic state gate: only update when status='pending_approval' AND pointsAwarded=false
  const [updated] = await db
    .update(choreInstancesTable)
    .set({
      status: "done",
      approvedAt: now,
      approvedByParentId: parentId,
      pointsAwarded: true,
    })
    .where(
      and(
        eq(choreInstancesTable.id, id),
        eq(choreInstancesTable.status, "pending_approval"),
        eq(choreInstancesTable.pointsAwarded, false),
      ),
    )
    .returning();

  if (!updated) {
    // Wrong state or already approved — return current state as a no-op (idempotent)
    const [current] = await db.select().from(choreInstancesTable).where(eq(choreInstancesTable.id, id));
    if (!current) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatInstance(current, await getMemberById(current.childId)));
    return;
  }

  // Award points — we know this is the first (and only) time because the atomic update succeeded
  if (updated.childId) {
    await db
      .update(familyMembersTable)
      .set({
        pointsBalance: sql`${familyMembersTable.pointsBalance} + ${updated.pointsValue}`,
        lifetimePoints: sql`${familyMembersTable.lifetimePoints} + ${updated.pointsValue}`,
      })
      .where(eq(familyMembersTable.id, updated.childId));

    await db.insert(pointTransactionsTable).values({
      memberId: updated.childId,
      amount: updated.pointsValue,
      type: "chore_earned",
      description: `Earned for: ${updated.title}`,
      choreInstanceId: updated.id,
      approvedByParentId: parentId,
    });

    const [member] = await db
      .select()
      .from(familyMembersTable)
      .where(eq(familyMembersTable.id, updated.childId));
    if (member) {
      await checkAndAwardBadges(member.id, member.lifetimePoints);
    }
  }

  res.json(formatInstance(updated, await getMemberById(updated.childId)));
});

// ── POST /api/chores/:id/reject — parent rejects, resets to todo or missed ─────

router.post("/:id/reject", async (req, res) => {
  const id = Number(req.params.id);
  const bodyParse = ChoreRejectBodySchema.safeParse(req.body);
  const parentId = bodyParse.success ? (bodyParse.data.parentId ?? null) : null;
  const pin = bodyParse.success ? (bodyParse.data.pin ?? null) : null;
  const markAsMissed = bodyParse.success ? (bodyParse.data.markAsMissed ?? false) : false;

  const ok = await verifyParentPin(parentId, pin, res);
  if (!ok) return;

  const newStatus = markAsMissed ? ("missed" as const) : ("todo" as const);

  const [inst] = await db
    .update(choreInstancesTable)
    .set({ status: newStatus, completedAt: null })
    .where(
      and(
        eq(choreInstancesTable.id, id),
        eq(choreInstancesTable.status, "pending_approval"),
      ),
    )
    .returning();

  if (!inst) {
    const [current] = await db.select().from(choreInstancesTable).where(eq(choreInstancesTable.id, id));
    if (!current) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatInstance(current, await getMemberById(current.childId)));
    return;
  }
  res.json(formatInstance(inst, await getMemberById(inst.childId)));
});

// ── Badge awarding ─────────────────────────────────────────────────────────────

function maxConsecutiveDays(sortedDates: string[]): number {
  if (sortedDates.length === 0) return 0;
  let maxStreak = 1, streak = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(sortedDates[i - 1]! + "T12:00:00Z").getTime();
    const curr = new Date(sortedDates[i]! + "T12:00:00Z").getTime();
    const diffDays = Math.round((curr - prev) / 86400000);
    if (diffDays === 1) { streak++; if (streak > maxStreak) maxStreak = streak; }
    else if (diffDays > 1) { streak = 1; }
  }
  return maxStreak;
}

async function checkAndAwardBadges(memberId: number, lifetimePoints: number) {
  const pointMilestones = [
    { threshold: 50,   emoji: "⭐",  title: "First Steps",     tier: "bronze" as const, description: "Earned 50 lifetime points" },
    { threshold: 100,  emoji: "🌟",  title: "Point Collector", tier: "bronze" as const, description: "Earned 100 lifetime points" },
    { threshold: 500,  emoji: "🥈",  title: "Silver Earner",   tier: "silver" as const, description: "Earned 500 lifetime points" },
    { threshold: 1000, emoji: "🥇",  title: "Gold Champion",   tier: "gold"   as const, description: "Earned 1000 lifetime points" },
  ];

  const [{ value: choreCount }] = await db
    .select({ value: count() })
    .from(choreInstancesTable)
    .where(
      sql`${choreInstancesTable.childId} = ${memberId} AND ${choreInstancesTable.status} = 'done'`,
    );
  const approvedCount = Number(choreCount ?? 0);

  const choreMilestones = [
    { threshold: 1,   emoji: "🎯", title: "First Chore",    tier: "bronze" as const, description: "Completed first chore" },
    { threshold: 10,  emoji: "💪", title: "Hard Worker",    tier: "silver" as const, description: "Approved 10 chores" },
    { threshold: 25,  emoji: "🏆", title: "Chore Champion", tier: "gold"   as const, description: "Approved 25 chores" },
    { threshold: 50,  emoji: "👑", title: "Chore Legend",   tier: "gold"   as const, description: "Approved 50 chores" },
    { threshold: 100, emoji: "🌠", title: "Century Hero",   tier: "gold"   as const, description: "Approved 100 chores" },
  ];

  const txDates = await db
    .select({ earnedOn: sql<string>`DATE(${pointTransactionsTable.createdAt})` })
    .from(pointTransactionsTable)
    .where(
      sql`${pointTransactionsTable.memberId} = ${memberId} AND ${pointTransactionsTable.amount} > 0 AND ${pointTransactionsTable.type} = 'chore_earned'`,
    );
  const uniqueDates = [...new Set(txDates.map((t) => t.earnedOn))].sort();
  const longestStreak = maxConsecutiveDays(uniqueDates);

  // Load active streak milestones from DB (with fallback defaults if none configured)
  let dbStreakMilestones = await db
    .select()
    .from(streakMilestonesTable)
    .where(eq(streakMilestonesTable.active, true));

  if (dbStreakMilestones.length === 0) {
    // Seed defaults on first use
    dbStreakMilestones = await db.insert(streakMilestonesTable).values([
      { days: 3,  title: "3-Day Streak",  emoji: "🔥", tier: "bronze", bonusPoints: 5,  description: "3 days of chores in a row",  active: true },
      { days: 7,  title: "7-Day Streak",  emoji: "🔥", tier: "silver", bonusPoints: 15, description: "7 days of chores in a row",  active: true },
      { days: 14, title: "2-Week Streak", emoji: "⚡", tier: "silver", bonusPoints: 30, description: "14 days of chores in a row", active: true },
      { days: 30, title: "30-Day Streak", emoji: "🌋", tier: "gold",   bonusPoints: 75, description: "30 days of chores in a row", active: true },
    ]).returning();
  }

  const streakMilestones = dbStreakMilestones.map((m) => ({
    threshold: m.days,
    emoji: m.emoji,
    title: m.title,
    tier: m.tier as "bronze" | "silver" | "gold",
    description: m.description ?? `Earned chores ${m.days} days in a row`,
    bonusPoints: m.bonusPoints,
  }));

  const existing = await db.select().from(badgesTable).where(eq(badgesTable.memberId, memberId));
  const existingTitles = new Set(existing.map((b) => b.title));

  for (const m of pointMilestones) {
    if (lifetimePoints >= m.threshold && !existingTitles.has(m.title))
      await db.insert(badgesTable).values({ memberId, ...m });
  }
  for (const m of choreMilestones) {
    if (approvedCount >= m.threshold && !existingTitles.has(m.title))
      await db.insert(badgesTable).values({ memberId, ...m });
  }
  for (const m of streakMilestones) {
    if (longestStreak >= m.threshold && !existingTitles.has(m.title)) {
      await db.insert(badgesTable).values({ memberId, ...m });
      // Award bonus points for reaching this streak milestone
      if (m.bonusPoints > 0) {
        await db.insert(pointTransactionsTable).values({
          memberId,
          type: "bonus",
          amount: m.bonusPoints,
          description: `🔥 ${m.title} bonus`,
        });
        // Update member's points balance
        await db
          .update(familyMembersTable)
          .set({
            pointsBalance: sql`${familyMembersTable.pointsBalance} + ${m.bonusPoints}`,
            lifetimePoints: sql`${familyMembersTable.lifetimePoints} + ${m.bonusPoints}`,
          })
          .where(eq(familyMembersTable.id, memberId));
      }
    }
  }
}

export { router as choresRouter };
