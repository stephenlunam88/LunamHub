// Settings routes — mounted at /api/settings
// Manages app settings including the parent PIN

import { Router } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db";
import { UpdateSettingsBody, VerifyPinBody } from "@workspace/api-zod";

const router = Router();

async function getOrCreateSettings() {
  const rows = await db.select().from(settingsTable);
  if (rows.length > 0) return rows[0];
  const [created] = await db.insert(settingsTable).values({}).returning();
  return created;
}

function formatSettings(s: typeof settingsTable.$inferSelect) {
  return {
    id: s.id,
    parentPin: s.parentPin,
    appName: s.appName,
    timezone: s.timezone,
    displayMode: s.displayMode,
  };
}

// GET /api/settings
router.get("/", async (_req, res) => {
  const settings = await getOrCreateSettings();
  res.json(formatSettings(settings));
});

// PATCH /api/settings
router.patch("/", async (req, res) => {
  const body = UpdateSettingsBody.parse(req.body);
  const settings = await getOrCreateSettings();
  const [updated] = await db.update(settingsTable).set(body).where(eq(settingsTable.id, settings.id)).returning();
  res.json(formatSettings(updated));
});

// POST /api/settings/verify-pin
router.post("/verify-pin", async (req, res) => {
  const { pin } = VerifyPinBody.parse(req.body);
  const settings = await getOrCreateSettings();
  res.json({ valid: settings.parentPin === pin });
});

import { eq } from "drizzle-orm";

export { router as settingsRouter };
