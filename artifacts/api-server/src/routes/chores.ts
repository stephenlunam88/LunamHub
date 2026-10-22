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
  pointMilestonesTable,
  choreMilestonesTable,
} from "@workspace/db";
import { eq, sql, lt, and, count, inArray, or } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcrypt";
import { calculateChoreStreak } from "../lib/choreStreak";
import { dayOfWeek, householdDate } from "../lib/householdDate";
import {
  clearLoginFailures,
  isLoginBlocked,
  recordLoginFailure,
} from "../lib/loginThrottle";

const ChoreApproveBodySchema = z.object({
  parentId: z.number().int().positive().optional(),
  pin: z.string().optional(),
});

const ChoreRejectBodySchema = z.object({
  parentId: z.number().int().positive().optional(),
  pin: z.string().optional(),
  markAsMissed: z.boolean().optional(),
});

const ChoreExcuseBodySchema = z.object({
  parentId: z.number().int().positive().optional(),
  pin: z.string().optional(),
});

const ChoreSkipBodySchema = z.object({
  parentId: z.number().int().positive().optional(),
  pin: z.string().optional(),
});

const ChoreAwayDayBodySchema = z.object({
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  childId: z.number().int().positive().optional(),
  parentId: z.number().int().positive().optional(),
  pin: z.string().optional(),
});

const ChoreDuePeriodSchema = z.enum(["morning", "afternoon", "evening"]);

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
  duePeriod: ChoreDuePeriodSchema.nullable().optional(),
});
export type CreateChoreInput = z.infer<typeof CreateChoreSchema>;

const router = Router();

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayStr() {
  return householdDate();
}

async function getMemberById(id: number | null | undefined) {
  if (!id) return undefined;
  const [m] = await db
    .select()
    .from(familyMembersTable)
    .where(eq(familyMembersTable.id, id));
  if (!m) return undefined;
  return formatMember(m);
}

function formatMember(m: typeof familyMembersTable.$inferSelect) {
  return {
    id: m.id,
    name: m.name,
    emoji: m.emoji,
    color: m.color,
    role: m.role,
    pointsBalance: m.pointsBalance,
    lifetimePoints: m.lifetimePoints,
    avatarUrl: m.avatarUrl ?? null,
    hasPin: !!m.pinHash,
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
    daysOfWeek: parseDaysOfWeek(inst.daysOfWeek),
    duePeriod: inst.duePeriod,
    pointsValue: inst.pointsValue,
    status: inst.status,
    pointsAwarded: inst.pointsAwarded,
    completedAt: inst.completedAt?.toISOString() ?? null,
    approvedAt: inst.approvedAt?.toISOString() ?? null,
    approvedByParentId: inst.approvedByParentId ?? null,
    missedAt: inst.missedAt?.toISOString() ?? null,
    excusedAt: inst.excusedAt?.toISOString() ?? null,
    excusedByParentId: inst.excusedByParentId ?? null,
    skippedAt: inst.skippedAt?.toISOString() ?? null,
    skippedByParentId: inst.skippedByParentId ?? null,
    createdAt: inst.createdAt.toISOString(),
  };
}

function parseDaysOfWeek(value: string | null): number[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter(
          (day): day is number =>
            Number.isInteger(day) && day >= 0 && day <= 6,
        )
      : [];
  } catch {
    return [];
  }
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
  const migratedIds = new Set(
    existingMigrated.map((r) => r.legacyChoreId).filter(Boolean) as number[],
  );

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
      await db
        .insert(choreTemplateChildrenTable)
        .values({
          templateId: template.id,
          childId: c.assignedTo,
        })
        .onConflictDoNothing();

      const instanceStatus =
        c.status === "approved"
          ? "done"
          : c.status === "completed"
            ? "pending_approval"
            : c.status === "missed"
              ? "missed"
              : "todo";

      // For resolved chores, preserve their original date. For pending/missed,
      // use today so they surface in the current day's flow.
      const isResolved =
        c.status === "approved" ||
        c.status === "completed" ||
        c.status === "missed";
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
          status:
            instanceStatus as (typeof choreInstancesTable.$inferSelect)["status"],
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

async function generateInstancesForDate(targetDate: string) {
  // Get all active templates with their child assignments.
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

  const targetDow = dayOfWeek(targetDate); // 0=Sun … 6=Sat

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
            daysOfWeek: template.daysOfWeek,
            duePeriod: template.duePeriod,
            dueDate: targetDate,
            status: "todo" as const,
            pointsAwarded: false,
          })),
        )
        .onConflictDoNothing();
    }

    if (template.repeatType === "weekly") {
      // Existing templates without selected days retain their original weekly day.
      const targetDays = template.daysOfWeek
        ? parseDaysOfWeek(template.daysOfWeek)
        : [dayOfWeek(householdDate(template.createdAt))];
      if (!targetDays.includes(targetDow)) continue;

      await db
        .insert(choreInstancesTable)
        .values(
          children.map((childId) => ({
            templateId: template.id,
            childId,
            title: template.title,
            pointsValue: template.pointsValue,
            repeatType: "weekly" as const,
            daysOfWeek: template.daysOfWeek,
            duePeriod: template.duePeriod,
            dueDate: targetDate,
            status: "todo" as const,
            pointsAwarded: false,
          })),
        )
        .onConflictDoNothing();
    }
  }
}

async function generateTodayInstances() {
  await runMigrationIfNeeded();

  const today = todayStr();
  await db
    .update(choreInstancesTable)
    .set({ status: "missed", missedAt: new Date() })
    .where(
      and(
        eq(choreInstancesTable.status, "todo"),
        lt(choreInstancesTable.dueDate, today),
      ),
    );

  await generateInstancesForDate(today);
}

function addDays(date: string, amount: number): string {
  const result = new Date(`${date}T12:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + amount);
  return result.toISOString().slice(0, 10);
}

// ── Parent PIN verification ────────────────────────────────────────────────────

async function verifyParentPin(
  parentId: number | null,
  pin: string | null,
  res: import("express").Response,
  clientKey = "unknown",
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
    res
      .status(403)
      .json({
      error:
        "This parent has no PIN configured. Set a PIN in Admin before approving.",
      });
    return false;
  }
  if (!pin) {
    res.status(403).json({ error: "PIN required for this parent" });
    return false;
  }
  const throttleKey = `member:${parentId}:${clientKey}`;
  if (isLoginBlocked(throttleKey)) {
    res.status(429).json({ error: "Too many PIN attempts. Try again later." });
    return false;
  }
  const valid = await bcrypt.compare(pin, parent.pinHash);
  if (!valid) {
    recordLoginFailure(throttleKey);
    res.status(403).json({ error: "Invalid PIN" });
    return false;
  }
  clearLoginFailures(throttleKey);
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
      pendingApproval: todayInstances.filter(
        (i) => i.status === "pending_approval",
      ).length,
      doneToday: todayInstances.filter((i) => i.status === "done").length,
      missedToday: mine.filter((i) => i.status === "missed").length,
      allTimeDone: mine.filter((i) => i.status === "done").length,
      // Legacy fields for backward compat with existing frontend
      pending: todayInstances.filter((i) => i.status === "todo").length,
      completed: todayInstances.filter((i) => i.status === "pending_approval")
        .length,
      approved: mine.filter((i) => i.status === "done").length,
      missed: mine.filter((i) => i.status === "missed").length,
      totalPoints: mine
        .filter((i) => i.status === "done" && i.pointsAwarded)
        .reduce((s, i) => s + i.pointsValue, 0),
    };
  });

  res.json(summary);
});

// ── GET /api/chores ────────────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  await generateTodayInstances();

  const today = todayStr();
  const assignedTo = req.query.assignedTo
    ? Number(req.query.assignedTo)
    : undefined;
  const statusFilter = req.query.status as string | undefined;

  let instances = await db
    .select()
    .from(choreInstancesTable)
    .where(
      or(
        eq(choreInstancesTable.dueDate, today),
        inArray(choreInstancesTable.status, ["missed", "excused", "skipped"]),
      ),
    )
    .orderBy(choreInstancesTable.createdAt);

  if (assignedTo != null)
    instances = instances.filter((i) => i.childId === assignedTo);
  if (statusFilter)
    instances = instances.filter((i) => i.status === statusFilter);

  const result = await Promise.all(
    instances.map(async (i) =>
      formatInstance(i, await getMemberById(i.childId)),
    ),
  );
  res.json(result);
});

// ── POST /api/chores — create template + seed today's instance(s) ──────────────

export async function createChoreRecords(input: unknown) {
  await runMigrationIfNeeded();

  const body = CreateChoreSchema.parse(input);
  const today = todayStr();

  const normalizedDaysOfWeek =
    body.repeatType === "weekly"
      ? [...new Set(body.daysOfWeek ?? [dayOfWeek(today)])]
      : [];
  const daysOfWeekJson =
    body.repeatType === "weekly" ? JSON.stringify(normalizedDaysOfWeek) : null;

  const [template] = await db
    .insert(choreTemplatesTable)
    .values({
      title: body.title,
      description: body.description,
      pointsValue: body.pointsValue,
      repeatType: body.repeatType,
      daysOfWeek: daysOfWeekJson,
      duePeriod: body.duePeriod ?? null,
      requiresApproval: true,
      active: true,
    })
    .returning();

  if (!template) {
    throw new Error("Failed to create chore");
  }

  // Collect assigned children
  const childIds: number[] = [];
  if (body.assignedToMany && body.assignedToMany.length > 0) {
    childIds.push(...body.assignedToMany);
  } else if (body.assignedTo) {
    childIds.push(body.assignedTo);
  }

  if (childIds.length > 0) {
    await db
      .insert(choreTemplateChildrenTable)
      .values(
        childIds.map((childId) => ({ templateId: template.id, childId })),
      );
  }

  // Seed initial instance(s):
  //   once: use specified dueDate or today
  //   daily: always today
  //   weekly: only if today is one of the target days; otherwise no instance yet
  const dueDate = body.repeatType === "once" ? (body.dueDate ?? today) : today;

  const todayDow = dayOfWeek(today);
  let shouldSeedToday = true;
  if (body.repeatType === "weekly") {
    shouldSeedToday = normalizedDaysOfWeek.includes(todayDow);
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
          daysOfWeek: daysOfWeekJson,
          duePeriod: template.duePeriod,
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
    instances.map(async (i) =>
      formatInstance(i, await getMemberById(i.childId)),
    ),
  );

  return {
    templateId: template.id,
    title: template.title,
    instances: formatted,
  };
}

router.post("/", async (req, res) => {
  const created = await createChoreRecords(req.body);
  res.status(201).json(created.instances);
});

const ChoreScheduleQuerySchema = z.object({
  startDate: z.string().optional(),
  days: z.coerce.number().int().min(1).max(14).default(7),
  assignedTo: z.coerce.number().int().positive().optional(),
});

router.get("/schedule", async (req, res) => {
  const parsed = ChoreScheduleQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid chore schedule range" });
    return;
  }

  const startDate = parsed.data.startDate ?? todayStr();
  const parsedDate = new Date(`${startDate}T12:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== startDate
  ) {
    res.status(400).json({ error: "startDate must be a real YYYY-MM-DD date" });
    return;
  }

  const dates = Array.from({ length: parsed.data.days }, (_, index) =>
    addDays(startDate, index),
  );
  const today = todayStr();
  if (dates.includes(today)) await generateTodayInstances();
  else await runMigrationIfNeeded();
  for (const date of dates) {
    if (date > today) await generateInstancesForDate(date);
  }

  const endDate = dates[dates.length - 1]!;
  let instances = await db
    .select()
    .from(choreInstancesTable)
    .where(
      and(
        sql`${choreInstancesTable.dueDate} >= ${startDate}`,
        sql`${choreInstancesTable.dueDate} <= ${endDate}`,
      ),
    );
  if (parsed.data.assignedTo !== undefined) {
    instances = instances.filter((row) => row.childId === parsed.data.assignedTo);
  }

  const periodOrder = { morning: 0, afternoon: 1, evening: 2 } as const;
  instances.sort((a, b) => {
    const dateOrder = a.dueDate.localeCompare(b.dueDate);
    if (dateOrder) return dateOrder;
    const periodA = periodOrder[a.duePeriod as keyof typeof periodOrder] ?? 3;
    const periodB = periodOrder[b.duePeriod as keyof typeof periodOrder] ?? 3;
    return periodA - periodB || a.createdAt.getTime() - b.createdAt.getTime();
  });

  res.json(
    await Promise.all(
      instances.map(async (instance) =>
        formatInstance(instance, await getMemberById(instance.childId)),
      ),
    ),
  );
});

// ── PATCH /api/chores/:id — update instance fields; propagates to template ─────

const UpdateChoreSchema = z.object({
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  repeatType: z.enum(["once", "daily", "weekly"]).optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  duePeriod: ChoreDuePeriodSchema.nullable().optional(),
  pointsValue: z.number().int().optional(),
  status: z
    .enum(["todo", "pending_approval", "done", "missed", "rejected"])
    .optional(),
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const body = UpdateChoreSchema.parse(req.body);

  const [inst] = await db
    .select()
    .from(choreInstancesTable)
    .where(eq(choreInstancesTable.id, id));
  if (!inst) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Fields that apply to the instance snapshot
  const instanceUpdates: Partial<typeof choreInstancesTable.$inferInsert> = {};
  if (body.title !== undefined) instanceUpdates.title = body.title;
  if (body.pointsValue !== undefined)
    instanceUpdates.pointsValue = body.pointsValue;
  if (body.dueDate !== undefined)
    instanceUpdates.dueDate = body.dueDate ?? inst.dueDate;
  if (body.repeatType !== undefined)
    instanceUpdates.repeatType = body.repeatType;
  if (body.daysOfWeek !== undefined)
    instanceUpdates.daysOfWeek = JSON.stringify([...new Set(body.daysOfWeek)]);
  if (body.duePeriod !== undefined)
    instanceUpdates.duePeriod = body.duePeriod;
  if (body.status !== undefined) instanceUpdates.status = body.status;

  const [updated] = await db
    .update(choreInstancesTable)
    .set(instanceUpdates)
    .where(eq(choreInstancesTable.id, id))
    .returning();

  // Propagate title, description, pointsValue, repeatType to the template so
  // future generated instances pick up the changes
  if (
    inst.templateId &&
    (body.title !== undefined ||
      body.description !== undefined ||
      body.pointsValue !== undefined ||
      body.repeatType !== undefined ||
      body.daysOfWeek !== undefined ||
      body.duePeriod !== undefined)
  ) {
    const templateUpdates: Partial<typeof choreTemplatesTable.$inferInsert> =
      {};
    if (body.title !== undefined) templateUpdates.title = body.title;
    if (body.description !== undefined)
      templateUpdates.description = body.description;
    if (body.pointsValue !== undefined)
      templateUpdates.pointsValue = body.pointsValue;
    if (body.repeatType !== undefined)
      templateUpdates.repeatType = body.repeatType;
    if (body.daysOfWeek !== undefined)
      templateUpdates.daysOfWeek = JSON.stringify([...new Set(body.daysOfWeek)]);
    if (body.duePeriod !== undefined)
      templateUpdates.duePeriod = body.duePeriod;
    await db
      .update(choreTemplatesTable)
      .set(templateUpdates)
      .where(eq(choreTemplatesTable.id, inst.templateId));

    const scheduleChanged =
      body.repeatType !== undefined || body.daysOfWeek !== undefined;
    if (scheduleChanged) {
      // Remove only untouched future snapshots. The calendar regenerates them
      // from the updated template when it next loads those dates.
      await db
        .delete(choreInstancesTable)
        .where(
          and(
            eq(choreInstancesTable.templateId, inst.templateId),
            eq(choreInstancesTable.status, "todo"),
            sql`${choreInstancesTable.dueDate} > ${todayStr()}`,
          ),
        );
    } else if (
      body.title !== undefined ||
      body.pointsValue !== undefined ||
      body.duePeriod !== undefined
    ) {
      const futureUpdates: Partial<typeof choreInstancesTable.$inferInsert> = {};
      if (body.title !== undefined) futureUpdates.title = body.title;
      if (body.pointsValue !== undefined)
        futureUpdates.pointsValue = body.pointsValue;
      if (body.duePeriod !== undefined)
        futureUpdates.duePeriod = body.duePeriod;
      await db
        .update(choreInstancesTable)
        .set(futureUpdates)
        .where(
          and(
            eq(choreInstancesTable.templateId, inst.templateId),
            eq(choreInstancesTable.status, "todo"),
            sql`${choreInstancesTable.dueDate} > ${todayStr()}`,
          ),
        );
    }
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
  if (!inst) {
    res.status(404).json({ error: "Not found" });
    return;
  }
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
    const [current] = await db
      .select()
      .from(choreInstancesTable)
      .where(eq(choreInstancesTable.id, id));
    if (!current) {
      res.status(404).json({ error: "Not found" });
      return;
    }
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

  const ok = await verifyParentPin(parentId, pin, res, req.ip);
  if (!ok) return;

  const now = new Date();

  // Atomic state gate: only update when status='pending_approval' AND pointsAwarded=false
  const updated = await db.transaction(async (tx) => {
    const [instance] = await tx
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
    if (!instance || !instance.childId) return instance;

    await tx
      .update(familyMembersTable)
      .set({
        pointsBalance: sql`${familyMembersTable.pointsBalance} + ${instance.pointsValue}`,
        lifetimePoints: sql`${familyMembersTable.lifetimePoints} + ${instance.pointsValue}`,
      })
      .where(eq(familyMembersTable.id, instance.childId));
    await tx.insert(pointTransactionsTable).values({
      memberId: instance.childId,
      amount: instance.pointsValue,
      type: "chore_earned",
      description: `Earned for: ${instance.title}`,
      choreInstanceId: instance.id,
      approvedByParentId: parentId,
    });
    return instance;
  });

  if (!updated) {
    // Wrong state or already approved — return current state as a no-op (idempotent)
    const [current] = await db
      .select()
      .from(choreInstancesTable)
      .where(eq(choreInstancesTable.id, id));
    if (!current) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(formatInstance(current, await getMemberById(current.childId)));
    return;
  }

  // Core accounting is committed atomically above; badge evaluation can follow.
  if (updated.childId) {
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
  const markAsMissed = bodyParse.success
    ? (bodyParse.data.markAsMissed ?? false)
    : false;

  const ok = await verifyParentPin(parentId, pin, res, req.ip);
  if (!ok) return;

  const [current] = await db
    .select()
    .from(choreInstancesTable)
    .where(eq(choreInstancesTable.id, id));
  if (!current) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // A missed chore is dismissed as a resolved rejection. Sending it back to
  // todo would cause the daily rollover to mark it missed again immediately.
  const newStatus =
    current.status === "missed"
      ? ("rejected" as const)
      : markAsMissed
        ? ("missed" as const)
        : ("todo" as const);

  const [inst] = await db
    .update(choreInstancesTable)
    .set({
      status: newStatus,
      completedAt: null,
      missedAt: newStatus === "missed" ? new Date() : null,
    })
    .where(
      and(
        eq(choreInstancesTable.id, id),
        inArray(choreInstancesTable.status, ["pending_approval", "missed"]),
      ),
    )
    .returning();

  if (!inst) {
    res.json(formatInstance(current, await getMemberById(current.childId)));
    return;
  }
  res.json(formatInstance(inst, await getMemberById(inst.childId)));
});

// ── POST /api/chores/:id/excuse — parent marks one missed occurrence as away ──

router.post("/:id/excuse", async (req, res) => {
  const id = Number(req.params.id);
  const bodyParse = ChoreExcuseBodySchema.safeParse(req.body);
  if (!bodyParse.success) {
    res.status(400).json({ error: "Invalid excuse request" });
    return;
  }

  const parentId = bodyParse.data.parentId ?? null;
  const pin = bodyParse.data.pin ?? null;
  const ok = await verifyParentPin(parentId, pin, res, req.ip);
  if (!ok) return;

  const now = new Date();
  const [instance] = await db
    .update(choreInstancesTable)
    .set({
      status: "excused",
      excusedAt: now,
      excusedByParentId: parentId,
      pointsAwarded: false,
    })
    .where(
      and(
        eq(choreInstancesTable.id, id),
        eq(choreInstancesTable.status, "missed"),
      ),
    )
    .returning();

  if (!instance) {
    const [current] = await db
      .select()
      .from(choreInstancesTable)
      .where(eq(choreInstancesTable.id, id));
    if (!current) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(409).json({ error: "Only a missed chore can be marked away" });
    return;
  }

  res.json(formatInstance(instance, await getMemberById(instance.childId)));
});

// ── POST /api/chores/:id/skip — parent resolves a missed chore as skipped ────

router.post("/:id/skip", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = ChoreSkipBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid skip request" });
    return;
  }
  const parentId = parsed.data.parentId ?? null;
  if (!(await verifyParentPin(parentId, parsed.data.pin ?? null, res, req.ip))) return;

  const now = new Date();
  const [instance] = await db
    .update(choreInstancesTable)
    .set({ status: "skipped", skippedAt: now, skippedByParentId: parentId, pointsAwarded: false })
    .where(and(eq(choreInstancesTable.id, id), eq(choreInstancesTable.status, "missed")))
    .returning();
  if (!instance) {
    const [current] = await db.select().from(choreInstancesTable).where(eq(choreInstancesTable.id, id));
    if (!current) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(409).json({ error: "Only a missed chore can be skipped" });
    return;
  }
  res.json(formatInstance(instance, await getMemberById(instance.childId)));
});

// ── POST /api/chores/away-day — excuse all missed chores for a date ───────────

router.post("/away-day", async (req, res) => {
  const parsed = ChoreAwayDayBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid away-day request" });
    return;
  }
  const { dueDate, childId } = parsed.data;
  const checkedDate = new Date(`${dueDate}T12:00:00.000Z`);
  if (Number.isNaN(checkedDate.getTime()) || checkedDate.toISOString().slice(0, 10) !== dueDate) {
    res.status(400).json({ error: "dueDate must be a real YYYY-MM-DD date" });
    return;
  }
  const parentId = parsed.data.parentId ?? null;
  if (!(await verifyParentPin(parentId, parsed.data.pin ?? null, res, req.ip))) return;

  const now = new Date();
  const conditions = [
    eq(choreInstancesTable.status, "missed"),
    eq(choreInstancesTable.dueDate, dueDate),
  ];
  if (childId !== undefined) conditions.push(eq(choreInstancesTable.childId, childId));
  const instances = await db
    .update(choreInstancesTable)
    .set({ status: "excused", excusedAt: now, excusedByParentId: parentId, pointsAwarded: false })
    .where(and(...conditions))
    .returning();
  res.json(
    await Promise.all(instances.map(async (instance) =>
      formatInstance(instance, await getMemberById(instance.childId)),
    )),
  );
});

// ── Badge awarding ─────────────────────────────────────────────────────────────

const DEFAULT_POINT_MILESTONES = [
  {
    threshold: 50,
    title: "First Steps",
    emoji: "⭐",
    tier: "bronze" as const,
    bonusPoints: 5,
    description: "Earned 50 lifetime points",
    active: true,
  },
  {
    threshold: 100,
    title: "Point Collector",
    emoji: "🌟",
    tier: "bronze" as const,
    bonusPoints: 10,
    description: "Earned 100 lifetime points",
    active: true,
  },
  {
    threshold: 500,
    title: "Silver Earner",
    emoji: "🥈",
    tier: "silver" as const,
    bonusPoints: 25,
    description: "Earned 500 lifetime points",
    active: true,
  },
  {
    threshold: 1000,
    title: "Gold Champion",
    emoji: "🥇",
    tier: "gold" as const,
    bonusPoints: 50,
    description: "Earned 1000 lifetime points",
    active: true,
  },
];

const DEFAULT_CHORE_MILESTONES = [
  {
    threshold: 1,
    title: "First Chore",
    emoji: "🎯",
    tier: "bronze" as const,
    bonusPoints: 5,
    description: "Completed first chore",
    active: true,
  },
  {
    threshold: 10,
    title: "Hard Worker",
    emoji: "💪",
    tier: "silver" as const,
    bonusPoints: 15,
    description: "Completed 10 chores",
    active: true,
  },
  {
    threshold: 25,
    title: "Chore Champion",
    emoji: "🏆",
    tier: "gold" as const,
    bonusPoints: 30,
    description: "Completed 25 chores",
    active: true,
  },
  {
    threshold: 50,
    title: "Chore Legend",
    emoji: "👑",
    tier: "gold" as const,
    bonusPoints: 50,
    description: "Completed 50 chores",
    active: true,
  },
  {
    threshold: 100,
    title: "Century Hero",
    emoji: "🌠",
    tier: "gold" as const,
    bonusPoints: 100,
    description: "Completed 100 chores",
    active: true,
  },
];

async function checkAndAwardBadges(memberId: number, lifetimePoints: number) {
  // Load active point milestones from DB (seed defaults if empty)
  let dbPointMilestones = await db
    .select()
    .from(pointMilestonesTable)
    .where(eq(pointMilestonesTable.active, true));
  if (dbPointMilestones.length === 0) {
    dbPointMilestones = await db
      .insert(pointMilestonesTable)
      .values(DEFAULT_POINT_MILESTONES)
      .returning();
  }
  const pointMilestones = dbPointMilestones.map((m) => ({
    threshold: m.threshold,
    emoji: m.emoji,
    title: m.title,
    tier: m.tier as "bronze" | "silver" | "gold",
    description: m.description ?? `Earned ${m.threshold} lifetime points`,
    bonusPoints: m.bonusPoints,
  }));

  const [{ value: choreCount }] = await db
    .select({ value: count() })
    .from(choreInstancesTable)
    .where(
      sql`${choreInstancesTable.childId} = ${memberId} AND ${choreInstancesTable.status} = 'done'`,
    );
  const approvedCount = Number(choreCount ?? 0);

  // Load active chore milestones from DB (seed defaults if empty)
  let dbChoreMilestones = await db
    .select()
    .from(choreMilestonesTable)
    .where(eq(choreMilestonesTable.active, true));
  if (dbChoreMilestones.length === 0) {
    dbChoreMilestones = await db
      .insert(choreMilestonesTable)
      .values(DEFAULT_CHORE_MILESTONES)
      .returning();
  }
  const choreMilestones = dbChoreMilestones.map((m) => ({
    threshold: m.threshold,
    emoji: m.emoji,
    title: m.title,
    tier: m.tier as "bronze" | "silver" | "gold",
    description: m.description ?? `Completed ${m.threshold} chores`,
    bonusPoints: m.bonusPoints,
  }));

  const allInstances = await db.select().from(choreInstancesTable);
  const longestStreak = calculateChoreStreak(
    allInstances,
    memberId,
    todayStr(),
  ).longest;

  // Load active streak milestones from DB (with fallback defaults if none configured)
  let dbStreakMilestones = await db
    .select()
    .from(streakMilestonesTable)
    .where(eq(streakMilestonesTable.active, true));

  if (dbStreakMilestones.length === 0) {
    // Seed defaults on first use
    dbStreakMilestones = await db
      .insert(streakMilestonesTable)
      .values([
        {
          days: 3,
          title: "3-Day Streak",
          emoji: "🔥",
          tier: "bronze",
          bonusPoints: 5,
          description: "3 days of chores in a row",
          active: true,
        },
        {
          days: 7,
          title: "7-Day Streak",
          emoji: "🔥",
          tier: "silver",
          bonusPoints: 15,
          description: "7 days of chores in a row",
          active: true,
        },
        {
          days: 14,
          title: "2-Week Streak",
          emoji: "⚡",
          tier: "silver",
          bonusPoints: 30,
          description: "14 days of chores in a row",
          active: true,
        },
        {
          days: 30,
          title: "30-Day Streak",
          emoji: "🌋",
          tier: "gold",
          bonusPoints: 75,
          description: "30 days of chores in a row",
          active: true,
        },
      ])
      .returning();
  }

  const streakMilestones = dbStreakMilestones.map((m) => ({
    threshold: m.days,
    emoji: m.emoji,
    title: m.title,
    tier: m.tier as "bronze" | "silver" | "gold",
    description: m.description ?? `Earned chores ${m.days} days in a row`,
    bonusPoints: m.bonusPoints,
  }));

  const existing = await db
    .select()
    .from(badgesTable)
    .where(eq(badgesTable.memberId, memberId));
  const existingTitles = new Set(existing.map((b) => b.title));

  for (const m of pointMilestones) {
    if (lifetimePoints >= m.threshold && !existingTitles.has(m.title)) {
      await db.insert(badgesTable).values({ memberId, ...m });
      if (m.bonusPoints > 0) {
        await db.insert(pointTransactionsTable).values({
          memberId,
          type: "bonus",
          amount: m.bonusPoints,
          description: `⭐ ${m.title} bonus`,
        });
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
  for (const m of choreMilestones) {
    if (approvedCount >= m.threshold && !existingTitles.has(m.title)) {
      await db.insert(badgesTable).values({ memberId, ...m });
      if (m.bonusPoints > 0) {
        await db.insert(pointTransactionsTable).values({
          memberId,
          type: "bonus",
          amount: m.bonusPoints,
          description: `🎯 ${m.title} bonus`,
        });
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
