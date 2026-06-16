// Screensaver Photos routes — mounted at /api/screensaver-photos
import { Router } from "express";
import { db } from "@workspace/db";
import { screensaverPhotosTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const BodySchema = z.object({
  url: z.string().min(1),
  filename: z.string().optional(),
});

function fmt(p: typeof screensaverPhotosTable.$inferSelect) {
  return {
    id: p.id,
    url: p.url,
    filename: p.filename ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}

// GET /api/screensaver-photos
router.get("/", async (_req, res) => {
  const photos = await db.select().from(screensaverPhotosTable).orderBy(desc(screensaverPhotosTable.createdAt));
  res.json(photos.map(fmt));
});

// POST /api/screensaver-photos
router.post("/", async (req, res) => {
  const body = BodySchema.parse(req.body);
  const [photo] = await db.insert(screensaverPhotosTable).values(body).returning();
  res.status(201).json(fmt(photo!));
});

// DELETE /api/screensaver-photos/:id
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(screensaverPhotosTable).where(eq(screensaverPhotosTable.id, id));
  res.status(204).send();
});

export { router as screensaverPhotosRouter };
