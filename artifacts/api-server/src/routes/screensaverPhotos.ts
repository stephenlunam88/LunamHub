// Screensaver Photos routes — mounted at /api/screensaver-photos
import { Router, type Request, type Response as ExpressResponse } from "express";
import { db } from "@workspace/db";
import { screensaverPhotosTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getGoogleAccessToken } from "../lib/google-calendar";
import { requireParentVerification } from "../middleware/requireParentVerification";
import { isLocalStorageMode, saveLocalPhoto } from "../lib/localPhotoStorage";
import { ObjectStorageService } from "../lib/objectStorage";

const router = Router();
const objectStorageService = new ObjectStorageService();
const PICKER_API = "https://photospicker.googleapis.com/v1";
const MAX_IMPORTED_PHOTOS = 500;
const MAX_PHOTO_BYTES = 50 * 1024 * 1024;

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

type PickerSession = {
  id?: string;
  pickerUri?: string;
  expireTime?: string;
  mediaItemsSet?: boolean;
};

type PickedMediaItem = {
  id?: string;
  type?: string;
  mediaFile?: {
    baseUrl?: string;
    mimeType?: string;
    filename?: string;
  };
};

function pickerSessionAllowed(req: Request, sessionId: string): boolean {
  const expiresAt = req.session.googlePhotosPickerSessions?.[sessionId];
  return typeof expiresAt === "number" && expiresAt > Date.now();
}

async function googleRequest(path: string, init?: RequestInit): Promise<globalThis.Response | null> {
  const token = await getGoogleAccessToken();
  if (!token) return null;
  return fetch(`${PICKER_API}${path}`, {
    ...init,
    signal: AbortSignal.timeout(30_000),
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
}

async function persistImportedPhoto(body: Buffer, contentType: string): Promise<string> {
  const id = randomUUID();
  if (isLocalStorageMode()) {
    await saveLocalPhoto(id, contentType, body);
    return `/api/storage/local-photos/${id}`;
  }
  const uploadUrl = await objectStorageService.getObjectEntityUploadURL();
  const upload = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body,
    signal: AbortSignal.timeout(60_000),
  });
  if (!upload.ok) throw new Error(`Object storage upload failed (${upload.status})`);
  return `/api/storage${objectStorageService.normalizeObjectEntityPath(uploadUrl)}`;
}

function reconnectRequired(res: ExpressResponse, status = 403): void {
  res.status(status).json({
    error: "Google Photos access needs to be connected.",
    reconnectRequired: true,
    connectUrl: "/api/auth/google/init?returnTo=photos",
  });
}

// POST /api/screensaver-photos
router.post("/", async (req, res) => {
  const body = BodySchema.parse(req.body);
  const [photo] = await db.insert(screensaverPhotosTable).values(body).returning();
  res.status(201).json(fmt(photo!));
});

// POST /api/screensaver-photos/google/session
// Creates a short-lived user-controlled Google Photos Picker session.
router.post("/google/session", requireParentVerification, async (req, res) => {
  try {
    const response = await googleRequest("/sessions", { method: "POST", body: "{}" });
    if (!response) return reconnectRequired(res, 401);
    if (response.status === 401) return reconnectRequired(res, 401);
    if (response.status === 403) {
      const detail = await response.clone().text();
      if (/service[_ ]?disabled|has not been used|is disabled/i.test(detail)) {
        res.status(503).json({
          error: "Enable the Google Photos Picker API in the existing LunamHub Google Cloud project, then try again.",
        });
        return;
      }
      return reconnectRequired(res);
    }
    if (!response.ok) {
      req.log.warn({ status: response.status }, "Google Photos Picker session creation failed");
      res.status(502).json({ error: "Google Photos is unavailable. Please try again." });
      return;
    }
    const session = (await response.json()) as PickerSession;
    if (!session.id || !session.pickerUri) {
      res.status(502).json({ error: "Google Photos returned an invalid picker session." });
      return;
    }
    const parsedExpiry = session.expireTime ? Date.parse(session.expireTime) : NaN;
    const expiresAt = Number.isFinite(parsedExpiry) ? parsedExpiry : Date.now() + 30 * 60_000;
    req.session.googlePhotosPickerSessions = {
      ...req.session.googlePhotosPickerSessions,
      [session.id]: expiresAt,
    };
    await new Promise<void>((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
    res.status(201).json({ sessionId: session.id, pickerUri: session.pickerUri, expiresAt });
  } catch (error) {
    req.log.error({ err: error }, "Google Photos Picker session error");
    res.status(502).json({ error: "Could not start Google Photos." });
  }
});

// GET /api/screensaver-photos/google/session/:sessionId
router.get("/google/session/:sessionId", requireParentVerification, async (req, res) => {
  const sessionId = String(req.params.sessionId);
  if (!pickerSessionAllowed(req, sessionId)) {
    res.status(404).json({ error: "Picker session expired." });
    return;
  }
  try {
    const response = await googleRequest(`/sessions/${encodeURIComponent(sessionId)}`);
    if (!response) return reconnectRequired(res, 401);
    if (!response.ok) {
      res.status(response.status === 404 ? 404 : 502).json({ error: "Could not check Google Photos selection." });
      return;
    }
    const session = (await response.json()) as PickerSession;
    res.json({ ready: session.mediaItemsSet === true });
  } catch (error) {
    req.log.warn({ err: error }, "Google Photos Picker polling error");
    res.status(502).json({ error: "Could not check Google Photos selection." });
  }
});

// POST /api/screensaver-photos/google/session/:sessionId/import
router.post("/google/session/:sessionId/import", requireParentVerification, async (req, res) => {
  const sessionId = String(req.params.sessionId);
  if (!pickerSessionAllowed(req, sessionId)) {
    res.status(404).json({ error: "Picker session expired." });
    return;
  }
  try {
    const selected: PickedMediaItem[] = [];
    let pageToken: string | undefined;
    do {
      const query = new URLSearchParams({ sessionId, pageSize: "100" });
      if (pageToken) query.set("pageToken", pageToken);
      const response = await googleRequest(`/mediaItems?${query}`);
      if (!response) return reconnectRequired(res, 401);
      if (!response.ok) {
        res.status(502).json({ error: "Could not read the selected Google photos." });
        return;
      }
      const page = (await response.json()) as { mediaItems?: PickedMediaItem[]; nextPageToken?: string };
      selected.push(...(page.mediaItems ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken && selected.length < MAX_IMPORTED_PHOTOS);

    const token = await getGoogleAccessToken();
    if (!token) return reconnectRequired(res, 401);
    let imported = 0;
    let duplicates = 0;
    let skipped = 0;
    for (const item of selected.slice(0, MAX_IMPORTED_PHOTOS)) {
      const mediaId = item.id;
      const file = item.mediaFile;
      if (!mediaId || !file?.baseUrl || !file.mimeType?.startsWith("image/")) {
        skipped++;
        continue;
      }
      const [existing] = await db.select({ id: screensaverPhotosTable.id })
        .from(screensaverPhotosTable)
        .where(eq(screensaverPhotosTable.googlePhotosMediaId, mediaId))
        .limit(1);
      if (existing) {
        duplicates++;
        continue;
      }
      const download = await fetch(`${file.baseUrl}=d`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(60_000),
      });
      const declaredSize = Number(download.headers.get("content-length") ?? 0);
      if (!download.ok || declaredSize > MAX_PHOTO_BYTES) {
        skipped++;
        continue;
      }
      const body = Buffer.from(await download.arrayBuffer());
      if (body.length === 0 || body.length > MAX_PHOTO_BYTES) {
        skipped++;
        continue;
      }
      const contentType = download.headers.get("content-type")?.split(";")[0] || file.mimeType;
      if (!contentType.startsWith("image/")) {
        skipped++;
        continue;
      }
      const url = await persistImportedPhoto(body, contentType);
      const inserted = await db.insert(screensaverPhotosTable).values({
        url,
        filename: file.filename?.slice(0, 500) || "Google Photos image",
        googlePhotosMediaId: mediaId,
      }).onConflictDoNothing({ target: screensaverPhotosTable.googlePhotosMediaId }).returning({ id: screensaverPhotosTable.id });
      if (inserted.length > 0) imported++;
      else duplicates++;
    }
    delete req.session.googlePhotosPickerSessions?.[sessionId];
    req.session.save(() => undefined);
    void googleRequest(`/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" }).catch(() => undefined);
    res.json({ imported, duplicates, skipped, selected: selected.length });
  } catch (error) {
    req.log.error({ err: error }, "Google Photos import failed");
    res.status(502).json({ error: "Google Photos import failed. Please try again." });
  }
});

// DELETE /api/screensaver-photos/:id
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(screensaverPhotosTable).where(eq(screensaverPhotosTable.id, id));
  res.status(204).send();
});

export { router as screensaverPhotosRouter };
