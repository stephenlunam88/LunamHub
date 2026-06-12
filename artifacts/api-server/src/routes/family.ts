// Family member routes
// Manages CRUD for family members and their points balances

import { Router } from "express";
import { db } from "@workspace/db";
import { familyMembersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateFamilyMemberBody,
  UpdateFamilyMemberBody,
  GetFamilyMemberParams,
  UpdateFamilyMemberParams,
  DeleteFamilyMemberParams,
} from "@workspace/api-zod";

const router = Router();

function formatMember(m: typeof familyMembersTable.$inferSelect) {
  return {
    id: m.id,
    name: m.name,
    emoji: m.emoji,
    color: m.color,
    role: m.role,
    pointsBalance: m.pointsBalance,
    createdAt: m.createdAt.toISOString(),
  };
}

// GET /api/family — list all family members
router.get("/", async (_req, res) => {
  const members = await db.select().from(familyMembersTable).orderBy(familyMembersTable.id);
  res.json(members.map(formatMember));
});

// POST /api/family — create a new family member
router.post("/", async (req, res) => {
  const body = CreateFamilyMemberBody.parse(req.body);
  const [member] = await db.insert(familyMembersTable).values(body).returning();
  res.status(201).json(formatMember(member));
});

// GET /api/family/:id — get a single family member
router.get("/:id", async (req, res) => {
  const { id } = GetFamilyMemberParams.parse({ id: Number(req.params.id) });
  const [member] = await db.select().from(familyMembersTable).where(eq(familyMembersTable.id, id));
  if (!member) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatMember(member));
});

// PATCH /api/family/:id — update a family member
router.patch("/:id", async (req, res) => {
  const { id } = UpdateFamilyMemberParams.parse({ id: Number(req.params.id) });
  const body = UpdateFamilyMemberBody.parse(req.body);
  const [member] = await db.update(familyMembersTable).set(body).where(eq(familyMembersTable.id, id)).returning();
  if (!member) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatMember(member));
});

// DELETE /api/family/:id — delete a family member
router.delete("/:id", async (req, res) => {
  const { id } = DeleteFamilyMemberParams.parse({ id: Number(req.params.id) });
  await db.delete(familyMembersTable).where(eq(familyMembersTable.id, id));
  res.status(204).send();
});

export { router as familyRouter };
