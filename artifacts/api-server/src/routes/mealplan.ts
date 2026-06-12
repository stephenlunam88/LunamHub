// Meal plan routes — mounted at /api/meal-plan
// Weekly meal plan entries and add-to-grocery feature

import { Router } from "express";
import { db } from "@workspace/db";
import { mealPlanTable, mealsTable, listsTable, listItemsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { formatMeal } from "./meals";
import {
  GetMealPlanQueryParams,
  AddMealPlanEntryBody,
  DeleteMealPlanEntryParams,
  AddMealIngredientsToGroceryParams,
} from "@workspace/api-zod";

const router = Router();

async function formatEntry(e: typeof mealPlanTable.$inferSelect) {
  const [meal] = await db.select().from(mealsTable).where(eq(mealsTable.id, e.mealId));
  return {
    id: e.id,
    mealId: e.mealId,
    meal: meal ? formatMeal(meal) : undefined,
    date: e.date,
    mealType: e.mealType,
  };
}

// GET /api/meal-plan
router.get("/", async (req, res) => {
  const params = GetMealPlanQueryParams.parse({ weekStart: req.query.weekStart });

  let entries = await db.select().from(mealPlanTable).orderBy(mealPlanTable.date);

  if (params.weekStart) {
    const start = params.weekStart;
    const endDate = new Date(start);
    endDate.setDate(endDate.getDate() + 7);
    const end = endDate.toISOString().split("T")[0];
    entries = entries.filter((e) => e.date >= start && e.date < end);
  }

  res.json(await Promise.all(entries.map(formatEntry)));
});

// POST /api/meal-plan
router.post("/", async (req, res) => {
  const body = AddMealPlanEntryBody.parse(req.body);
  const [entry] = await db.insert(mealPlanTable).values(body).returning();
  res.status(201).json(await formatEntry(entry));
});

// DELETE /api/meal-plan/:id
router.delete("/:id", async (req, res) => {
  const { id } = DeleteMealPlanEntryParams.parse({ id: Number(req.params.id) });
  await db.delete(mealPlanTable).where(eq(mealPlanTable.id, id));
  res.status(204).send();
});

// POST /api/meal-plan/:id/add-to-grocery
router.post("/:id/add-to-grocery", async (req, res) => {
  const { id } = AddMealIngredientsToGroceryParams.parse({ id: Number(req.params.id) });

  const [entry] = await db.select().from(mealPlanTable).where(eq(mealPlanTable.id, id));
  if (!entry) { res.status(404).json({ error: "Not found" }); return; }

  const [meal] = await db.select().from(mealsTable).where(eq(mealsTable.id, entry.mealId));
  if (!meal?.ingredients) { res.json({ added: 0 }); return; }

  const existing = await db.select().from(listsTable).where(eq(listsTable.category, "grocery"));
  let groceryList = existing[0];
  if (!groceryList) {
    const [created] = await db.insert(listsTable).values({ name: "Grocery", category: "grocery" }).returning();
    groceryList = created;
  }

  const ingredients = meal.ingredients.split(",").map((s: string) => s.trim()).filter((s: string) => s.length > 0);
  if (ingredients.length > 0) {
    await db.insert(listItemsTable).values(ingredients.map((text: string) => ({ listId: groceryList.id, text })));
  }

  res.json({ added: ingredients.length });
});

export { router as mealPlanRouter };
