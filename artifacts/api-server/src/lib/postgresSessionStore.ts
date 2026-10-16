import session, { type SessionData } from "express-session";
import { pool } from "@workspace/db";

type SessionCallback = (err?: unknown) => void;

export class PostgresSessionStore extends session.Store {
  get(
    sid: string,
    callback: (err: unknown, session?: SessionData | null) => void,
  ) {
    pool
      .query<{
        sess: SessionData;
      }>("SELECT sess FROM http_sessions WHERE sid = $1 AND expires_at > NOW()", [sid])
      .then((result) => callback(null, result.rows[0]?.sess ?? null), callback);
  }

  set(sid: string, value: SessionData, callback?: SessionCallback) {
    const expiresAt =
      value.cookie.expires ?? new Date(Date.now() + 24 * 60 * 60 * 1000);
    pool
      .query(
        `INSERT INTO http_sessions (sid, sess, expires_at) VALUES ($1, $2, $3)
       ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess, expires_at = EXCLUDED.expires_at`,
        [sid, value, expiresAt],
      )
      .then(
        () => callback?.(),
        (error) => callback?.(error),
      );
  }

  destroy(sid: string, callback?: SessionCallback) {
    pool.query("DELETE FROM http_sessions WHERE sid = $1", [sid]).then(
      () => callback?.(),
      (error) => callback?.(error),
    );
  }

  touch(sid: string, value: SessionData, callback?: SessionCallback) {
    const expiresAt =
      value.cookie.expires ?? new Date(Date.now() + 24 * 60 * 60 * 1000);
    pool
      .query("UPDATE http_sessions SET expires_at = $2 WHERE sid = $1", [
        sid,
        expiresAt,
      ])
      .then(
        () => callback?.(),
        (error) => callback?.(error),
      );
  }
}

export async function ensureSessionSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS http_sessions (
      sid text PRIMARY KEY,
      sess jsonb NOT NULL,
      expires_at timestamptz NOT NULL
    );
    CREATE INDEX IF NOT EXISTS http_sessions_expires_at_idx ON http_sessions(expires_at);
    DELETE FROM http_sessions WHERE expires_at <= NOW();
  `);
}
