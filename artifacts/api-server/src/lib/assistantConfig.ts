import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { pool } from "@workspace/db";

const CONFIG_ID = 1;

export async function ensureAssistantConfigSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS assistant_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      encrypted_api_key TEXT,
      model TEXT
    )
  `);
  await pool.query(
    "INSERT INTO assistant_config (id) VALUES ($1) ON CONFLICT (id) DO NOTHING",
    [CONFIG_ID],
  );
}

function encryptionKey() {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) throw new Error("SESSION_SECRET is required to protect the assistant API key");
  return createHash("sha256").update(`lunamhub-assistant-key:${secret}`).digest();
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

function decrypt(value: string) {
  const [iv, tag, encrypted] = value.split(".");
  if (!iv || !tag || !encrypted) throw new Error("Stored assistant API key is invalid");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export async function getAssistantConfig() {
  const result = await pool.query<{ encrypted_api_key: string | null; model: string | null }>(
    "SELECT encrypted_api_key, model FROM assistant_config WHERE id = $1",
    [CONFIG_ID],
  );
  const row = result.rows[0];
  const storedKey = row?.encrypted_api_key ? decrypt(row.encrypted_api_key) : "";
  return {
    apiKey: storedKey || process.env["OPENAI_API_KEY"] || "",
    model: row?.model?.trim() || process.env["OPENAI_MODEL"]?.trim() || "",
    keySource: storedKey ? "app" as const : process.env["OPENAI_API_KEY"] ? "environment" as const : "none" as const,
  };
}

export async function getAssistantConfigStatus() {
  const result = await pool.query<{ encrypted_api_key: string | null; model: string | null }>(
    "SELECT encrypted_api_key, model FROM assistant_config WHERE id = $1",
    [CONFIG_ID],
  );
  const row = result.rows[0];
  const hasStoredKey = Boolean(row?.encrypted_api_key);
  const hasEnvironmentKey = Boolean(process.env["OPENAI_API_KEY"]);
  return {
    configured: hasStoredKey || hasEnvironmentKey,
    keySource: hasStoredKey ? "app" as const : hasEnvironmentKey ? "environment" as const : "none" as const,
    model: row?.model?.trim() || process.env["OPENAI_MODEL"]?.trim() || "",
    modelSource: row?.model?.trim() ? "app" as const : process.env["OPENAI_MODEL"]?.trim() ? "environment" as const : "none" as const,
  };
}

export async function saveAssistantConfig(input: { apiKey?: string; model: string }) {
  const apiKey = input.apiKey?.trim();
  if (apiKey) {
    await pool.query(
      "UPDATE assistant_config SET encrypted_api_key = $1, model = $2 WHERE id = $3",
      [encrypt(apiKey), input.model.trim(), CONFIG_ID],
    );
  } else {
    await pool.query(
      "UPDATE assistant_config SET model = $1 WHERE id = $2",
      [input.model.trim(), CONFIG_ID],
    );
  }
}

export async function clearStoredAssistantKey() {
  await pool.query(
    "UPDATE assistant_config SET encrypted_api_key = NULL WHERE id = $1",
    [CONFIG_ID],
  );
}
