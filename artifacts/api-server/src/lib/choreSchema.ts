import { pool } from "@workspace/db";
import { logger } from "./logger";

/** Adds the optional chore schedule fields without rewriting existing rows. */
export async function ensureChoreSchema(): Promise<void> {
  // Keep the enum change in its own statement: PostgreSQL only makes a newly
  // added enum value available after the ALTER TYPE statement commits.
  await pool.query(
    `ALTER TYPE repeat_type ADD VALUE IF NOT EXISTS 'fortnightly'`,
  );
  await pool.query(`
    DO $$ BEGIN
      CREATE TYPE chore_assignment_mode AS ENUM ('assigned', 'claimable');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await pool.query(
    `ALTER TYPE chore_instance_status ADD VALUE IF NOT EXISTS 'excused'`,
  );
  await pool.query(
    `ALTER TYPE chore_instance_status ADD VALUE IF NOT EXISTS 'skipped'`,
  );
  await pool.query(`
    ALTER TABLE chore_templates
      ADD COLUMN IF NOT EXISTS due_period text,
      ADD COLUMN IF NOT EXISTS start_date text,
      ADD COLUMN IF NOT EXISTS assignment_mode chore_assignment_mode NOT NULL DEFAULT 'assigned';

    ALTER TABLE chore_instances
      ADD COLUMN IF NOT EXISTS days_of_week text,
      ADD COLUMN IF NOT EXISTS start_date text,
      ADD COLUMN IF NOT EXISTS assignment_mode chore_assignment_mode NOT NULL DEFAULT 'assigned',
      ADD COLUMN IF NOT EXISTS due_period text,
      ADD COLUMN IF NOT EXISTS excused_at timestamp,
      ADD COLUMN IF NOT EXISTS excused_by_parent_id integer REFERENCES family_members(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS skipped_at timestamp,
      ADD COLUMN IF NOT EXISTS skipped_by_parent_id integer REFERENCES family_members(id) ON DELETE SET NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS unique_claimable_chore_instance_per_day
      ON chore_instances(template_id, due_date)
      WHERE assignment_mode = 'claimable' AND child_id IS NULL;

    CREATE TABLE IF NOT EXISTS chore_instance_claimants (
      id serial PRIMARY KEY,
      instance_id integer NOT NULL REFERENCES chore_instances(id) ON DELETE CASCADE,
      child_id integer NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
      claimed_at timestamp NOT NULL DEFAULT NOW(),
      CONSTRAINT unique_chore_instance_claimant UNIQUE(instance_id, child_id)
    );
  `);
  logger.info("Chore schedule schema ready");
}
