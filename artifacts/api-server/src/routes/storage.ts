import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import express from "express";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import {
  isLocalStorageMode,
  saveLocalPhoto,
  readLocalPhoto,
} from "../lib/localPhotoStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * - On Replit: returns a GCS presigned PUT URL + objectPath.
 * - On NAS/local: returns a path to our own PUT endpoint + local objectPath.
 *   The browser PUTs directly to that path; the API saves to /data/photos.
 */
router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  const { name, size, contentType } = parsed.data;

  if (isLocalStorageMode()) {
    const uuid = randomUUID();
    const uploadURL = `/api/storage/local-upload/${uuid}`;
    const objectPath = `/local-photos/${uuid}`;
    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      })
    );
    return;
  }

  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * PUT /storage/local-upload/:uuid
 *
 * Receives a raw file body and saves it to the local photo directory.
 * Only active when Replit Object Storage env vars are absent (NAS/local mode).
 */
router.put(
  "/storage/local-upload/:uuid",
  express.raw({ type: "*/*", limit: "50mb" }),
  async (req: Request, res: Response) => {
    if (!isLocalStorageMode()) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const uuid = String(req.params.uuid);
    if (!uuid || !/^[0-9a-f-]{36}$/.test(uuid)) {
      res.status(400).json({ error: "Invalid upload ID" });
      return;
    }

    const contentType =
      (req.headers["content-type"] as string | undefined) ||
      "application/octet-stream";

    const body = req.body as Buffer;
    if (!body || body.length === 0) {
      res.status(400).json({ error: "Empty body" });
      return;
    }

    try {
      await saveLocalPhoto(uuid, contentType, body);
      res.status(200).json({ ok: true });
    } catch (error) {
      req.log.error({ err: error }, "Error saving local photo");
      res.status(500).json({ error: "Failed to save photo" });
    }
  }
);

/**
 * GET /storage/local-photos/:uuid
 *
 * Serves a locally stored photo by UUID.
 * Only active when Replit Object Storage env vars are absent (NAS/local mode).
 */
router.get("/storage/local-photos/:uuid", async (req: Request, res: Response) => {
  if (!isLocalStorageMode()) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const uuid = String(req.params.uuid);
  if (!uuid || !/^[0-9a-f-]{36}$/.test(uuid)) {
    res.status(400).json({ error: "Invalid photo ID" });
    return;
  }

  try {
    const result = await readLocalPhoto(uuid);
    if (!result) {
      res.status(404).json({ error: "Photo not found" });
      return;
    }
    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Content-Length", String(result.body.length));
    res.status(200).send(result.body);
  } catch (error) {
    req.log.error({ err: error }, "Error serving local photo");
    res.status(500).json({ error: "Failed to serve photo" });
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    // --- Protected route example (uncomment when using replit-auth) ---
    // if (!req.isAuthenticated()) {
    //   res.status(401).json({ error: "Unauthorized" });
    //   return;
    // }
    // const canAccess = await objectStorageService.canAccessObjectEntity({
    //   userId: req.user.id,
    //   objectFile,
    //   requestedPermission: ObjectPermission.READ,
    // });
    // if (!canAccess) {
    //   res.status(403).json({ error: "Forbidden" });
    //   return;
    // }

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
