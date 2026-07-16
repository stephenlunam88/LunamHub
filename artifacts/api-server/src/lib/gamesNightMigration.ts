import { pool } from "@workspace/db";
import { logger } from "./logger";

export async function ensureGamesNightSchema(): Promise<void> {
  await pool.query(`
    DO $$ BEGIN
      CREATE TYPE game_result_type AS ENUM ('winner', 'placement', 'team', 'manual');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE game_guest_type AS ENUM ('regular', 'one_time');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS games (
      id serial PRIMARY KEY,
      name text NOT NULL UNIQUE,
      icon text NOT NULL DEFAULT '🎲',
      image_url text,
      min_players integer NOT NULL DEFAULT 2,
      max_players integer NOT NULL DEFAULT 8,
      result_type game_result_type NOT NULL DEFAULT 'winner',
      points_config jsonb NOT NULL DEFAULT '{}'::jsonb,
      active boolean NOT NULL DEFAULT true,
      created_at timestamp NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS game_guests (
      id serial PRIMARY KEY,
      name text NOT NULL,
      nickname text,
      avatar_url text,
      avatar_emoji text,
      guest_type game_guest_type NOT NULL DEFAULT 'regular',
      active boolean NOT NULL DEFAULT true,
      created_at timestamp NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS game_sessions (
      id serial PRIMARY KEY,
      game_id integer NOT NULL REFERENCES games(id) ON DELETE RESTRICT,
      played_at timestamp NOT NULL DEFAULT now(),
      result_summary text,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS game_participants (
      id serial PRIMARY KEY,
      session_id integer NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
      family_member_id integer REFERENCES family_members(id) ON DELETE SET NULL,
      guest_id integer REFERENCES game_guests(id) ON DELETE SET NULL,
      player_key text NOT NULL,
      display_name text NOT NULL,
      avatar_url text,
      avatar_emoji text,
      points integer NOT NULL DEFAULT 0,
      placement integer,
      team text,
      is_winner boolean NOT NULL DEFAULT false,
      role text
    );

    CREATE INDEX IF NOT EXISTS game_sessions_played_at_idx ON game_sessions(played_at DESC);
    CREATE INDEX IF NOT EXISTS game_participants_session_idx ON game_participants(session_id);
    CREATE INDEX IF NOT EXISTS game_participants_player_idx ON game_participants(player_key);
  `);
  await pool.query(
    `ALTER TYPE game_result_type ADD VALUE IF NOT EXISTS 'custom'`,
  );
  logger.info("Games Night database schema ready");
}
