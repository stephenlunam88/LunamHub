import { pool } from "@workspace/db";
import { logger } from "./logger";

/** Keeps existing installations compatible with Google Photos imports. */
export async function ensureScreensaverPhotoSchema(): Promise<void> {
  await pool.query(`
    ALTER TABLE screensaver_photos
      ADD COLUMN IF NOT EXISTS google_photos_media_id text;

    CREATE UNIQUE INDEX IF NOT EXISTS screensaver_photos_google_media_id_idx
      ON screensaver_photos(google_photos_media_id)
      WHERE google_photos_media_id IS NOT NULL;
  `);
  logger.info("Screensaver photo schema ready");
}
