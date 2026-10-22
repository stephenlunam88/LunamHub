import { pool } from "@workspace/db";
import { logger } from "./logger";

/** Adds the optional chore schedule fields without rewriting existing rows. */
export async function ensureChoreSchema(): Promise<void> {
  // Keep the enum change in its own statement: PostgreSQL only makes a newly
  // added enum value available after the ALTER TYPE statement commits.
  await pool.query(
    `ALTER TYPE chore_instance_status ADD VALUE IF NOT EXISTS 'excused'`,
  );
  await pool.query(
    `ALTER TYPE chore_instance_status ADD VALUE IF NOT EXISTS 'skipped'`,
  );
  await pool.query(`
    ALTER TABLE chore_templates
      ADD COLUMN IF NOT EXISTS due_period text;

    ALTER TABLE chore_instances
      ADD COLUMN IF NOT EXISTS days_of_week text,
      ADD COLUMN IF NOT EXISTS due_period text,
      ADD COLUMN IF NOT EXISTS excused_at timestamp,
      ADD COLUMN IF NOT EXISTS excused_by_parent_id integer REFERENCES family_members(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS skipped_at timestamp,
      ADD COLUMN IF NOT EXISTS skipped_by_parent_id integer REFERENCES family_members(id) ON DELETE SET NULL;
  `);
  logger.info("Chore schedule schema ready");
}
