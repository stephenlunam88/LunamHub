// Local filesystem photo storage — fallback for NAS/Docker deployments
// where Replit Object Storage env vars are absent.

import { mkdir, writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const DEFAULT_LOCAL_PHOTO_DIR = "/data/photos";

export function getLocalPhotoDir(): string {
  return process.env.LOCAL_PHOTO_DIR || DEFAULT_LOCAL_PHOTO_DIR;
}

export function isLocalStorageMode(): boolean {
  return !process.env.PRIVATE_OBJECT_DIR;
}

async function ensureDir(dir: string): Promise<void> {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

export async function saveLocalPhoto(
  uuid: string,
  contentType: string,
  body: Buffer
): Promise<void> {
  const dir = getLocalPhotoDir();
  await ensureDir(dir);
  await writeFile(path.join(dir, uuid), body);
  await writeFile(
    path.join(dir, `${uuid}.meta.json`),
    JSON.stringify({ contentType })
  );
}

export async function readLocalPhoto(
  uuid: string
): Promise<{ body: Buffer; contentType: string } | null> {
  const dir = getLocalPhotoDir();
  const filePath = path.join(dir, uuid);
  const metaPath = path.join(dir, `${uuid}.meta.json`);

  if (!existsSync(filePath)) return null;

  const body = await readFile(filePath);
  let contentType = "application/octet-stream";
  if (existsSync(metaPath)) {
    try {
      const meta = JSON.parse(await readFile(metaPath, "utf8")) as {
        contentType?: string;
      };
      if (meta.contentType) contentType = meta.contentType;
    } catch {
      // ignore malformed meta
    }
  }

  return { body, contentType };
}
