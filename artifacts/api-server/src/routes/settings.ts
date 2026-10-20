// Settings routes — mounted at /api/settings
// Manages app settings including the parent PIN

import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db";
import { UpdateSettingsBody, VerifyPinBody } from "@workspace/api-zod";
import bcrypt from "bcrypt";
import {
  requireParentVerification,
  PARENT_VERIFICATION_TTL_MS,
} from "../middleware/requireParentVerification";
import {
  clearLoginFailures,
  isLoginBlocked,
  recordLoginFailure,
} from "../lib/loginThrottle";
import {
  clearStoredAssistantKey,
  getAssistantConfigStatus,
  saveAssistantConfig,
} from "../lib/assistantConfig";

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
    hasParentPin: !!s.parentPin,
    appName: s.appName,
    timezone: s.timezone,
    displayMode: s.displayMode,
    weatherCity: s.weatherCity ?? null,
    screensaverTimeout: s.screensaverTimeout,
    screensaverPhotoInterval: s.screensaverPhotoInterval,
  };
}

// GET /api/settings
router.get("/", async (_req, res) => {
  const settings = await getOrCreateSettings();
  res.json(formatSettings(settings));
});

// PATCH /api/settings
router.patch("/", requireParentVerification, async (req, res) => {
  const body = UpdateSettingsBody.parse(req.body);
  const settings = await getOrCreateSettings();
  const { parentPin, ...fields } = body;
  const update = {
    ...fields,
    ...(parentPin ? { parentPin: await bcrypt.hash(parentPin, 12) } : {}),
  };
  const [updated] = await db
    .update(settingsTable)
    .set(update)
    .where(eq(settingsTable.id, settings.id))
    .returning();
  res.json(formatSettings(updated));
});

// POST /api/settings/verify-pin
router.post("/verify-pin", async (req, res) => {
  const throttleKey = `parent:${req.ip}`;
  if (isLoginBlocked(throttleKey)) {
    res.status(429).json({ error: "Too many PIN attempts. Try again later." });
    return;
  }
  const { pin } = VerifyPinBody.parse(req.body);
  const settings = await getOrCreateSettings();
  const hashed = settings.parentPin.startsWith("$2");
  const valid = hashed
    ? await bcrypt.compare(pin, settings.parentPin)
    : settings.parentPin === pin;
  if (valid) {
    clearLoginFailures(throttleKey);
    req.session.parentVerifiedUntil = Date.now() + PARENT_VERIFICATION_TTL_MS;
    if (!hashed) {
      await db
        .update(settingsTable)
        .set({ parentPin: await bcrypt.hash(pin, 12) })
        .where(eq(settingsTable.id, settings.id));
    }
  }
  if (!valid) recordLoginFailure(throttleKey);
  res.json({ valid });
});

const AssistantConfigBody = z.object({
  apiKey: z.string().max(500).optional(),
  model: z.string().trim().min(1).max(120),
});

// Never return the API key; only expose whether one is configured.
router.get("/assistant", requireParentVerification, async (_req, res) => {
  res.json(await getAssistantConfigStatus());
});

router.put("/assistant", requireParentVerification, async (req, res) => {
  const body = AssistantConfigBody.parse(req.body);
  await saveAssistantConfig(body);
  res.json(await getAssistantConfigStatus());
});

router.delete("/assistant/key", requireParentVerification, async (_req, res) => {
  await clearStoredAssistantKey();
  res.json(await getAssistantConfigStatus());
});

import { eq } from "drizzle-orm";

export { router as settingsRouter };
