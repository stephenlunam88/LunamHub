// Family member routes
// Manages CRUD for family members, points balances, and per-parent PINs

import { Router } from "express";
import { db } from "@workspace/db";
import { familyMembersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import {
  CreateFamilyMemberBody,
  UpdateFamilyMemberBody,
  GetFamilyMemberParams,
  UpdateFamilyMemberParams,
  DeleteFamilyMemberParams,
} from "@workspace/api-zod";
import { z } from "zod";

const router = Router();

const BCRYPT_ROUNDS = 10;
const IdParams = z.object({ id: z.number().int().positive() });
const SetPinSchema = z.object({ pin: z.string().min(1) });
const VerifyPinSchema = z.object({ pin: z.string().min(1) });

export function formatMember(m: typeof familyMembersTable.$inferSelect) {
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

// GET /api/family/:id — get a single family member (must be before /:id/* routes)
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

// POST /api/family/:id/set-pin — set or update per-parent PIN (bcrypt hashed)
router.post("/:id/set-pin", async (req, res) => {
  const { id } = IdParams.parse({ id: Number(req.params.id) });
  const { pin } = SetPinSchema.parse(req.body);
  const pinHash = await bcrypt.hash(pin, BCRYPT_ROUNDS);
  const [member] = await db
    .update(familyMembersTable)
    .set({ pinHash })
    .where(eq(familyMembersTable.id, id))
    .returning();
  if (!member) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatMember(member));
});

// POST /api/family/:id/verify-pin — verify a parent's PIN
router.post("/:id/verify-pin", async (req, res) => {
  const { id } = IdParams.parse({ id: Number(req.params.id) });
  const { pin } = VerifyPinSchema.parse(req.body);
  const [member] = await db.select().from(familyMembersTable).where(eq(familyMembersTable.id, id));
  if (!member) { res.json({ valid: false }); return; }
  if (!member.pinHash) {
    // No PIN set — fallback to global settings PIN check or just allow
    res.json({ valid: true });
    return;
  }
  const valid = await bcrypt.compare(pin, member.pinHash);
  res.json({ valid });
});

export { router as familyRouter };
