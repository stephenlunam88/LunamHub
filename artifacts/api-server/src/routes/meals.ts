// Meals routes — mounted at /api/meals
// Handles favourite meals library

import { Router } from "express";
import { db } from "@workspace/db";
import { mealsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateMealBody,
  UpdateMealBody,
  UpdateMealParams,
  DeleteMealParams,
} from "@workspace/api-zod";

const router = Router();

export function formatMeal(m: typeof mealsTable.$inferSelect) {
  return {
    id: m.id,
    name: m.name,
    notes: m.notes ?? null,
    ingredients: m.ingredients ?? null,
    createdAt: m.createdAt.toISOString(),
  };
}

// GET /api/meals
router.get("/", async (_req, res) => {
  const meals = await db.select().from(mealsTable).orderBy(mealsTable.name);
  res.json(meals.map(formatMeal));
});

// POST /api/meals
router.post("/", async (req, res) => {
  const body = CreateMealBody.parse(req.body);
  const [meal] = await db.insert(mealsTable).values(body).returning();
  res.status(201).json(formatMeal(meal));
});

// PATCH /api/meals/:id
router.patch("/:id", async (req, res) => {
  const { id } = UpdateMealParams.parse({ id: Number(req.params.id) });
  const body = UpdateMealBody.parse(req.body);
  const [meal] = await db.update(mealsTable).set(body).where(eq(mealsTable.id, id)).returning();
  if (!meal) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatMeal(meal));
});

// DELETE /api/meals/:id
router.delete("/:id", async (req, res) => {
  const { id } = DeleteMealParams.parse({ id: Number(req.params.id) });
  await db.delete(mealsTable).where(eq(mealsTable.id, id));
  res.status(204).send();
});

export { router as mealsRouter };
