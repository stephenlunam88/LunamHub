// Google OAuth 2.0 redirect flow
// GET /api/auth/google/init     — send browser to Google consent screen
// GET /api/auth/google/callback — exchange code for tokens, store refresh token

import { Router } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db";
import { logger } from "../lib/logger";

const router = Router();

const SCOPES = "https://www.googleapis.com/auth/calendar";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

function getOAuthConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

// Redirect the browser to Google's consent screen
router.get("/auth/google/init", (req, res): void => {
  const config = getOAuthConfig();
  if (!config) {
    res.status(503).json({
      error:
        "Google OAuth not configured. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URI.",
    });
    return;
  }
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent"); // always return a refresh_token
  res.redirect(url.toString());
});

// Exchange the authorisation code for tokens and persist the refresh token
router.get("/auth/google/callback", async (req, res): Promise<void> => {
  const config = getOAuthConfig();
  if (!config) {
    res.status(503).send("Google OAuth not configured.");
    return;
  }

  const code = req.query.code as string | undefined;
  const error = req.query.error as string | undefined;

  if (error || !code) {
    logger.warn({ error }, "gcal: OAuth callback received error");
    res.redirect("/?gcal=error");
    return;
  }

  try {
    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = (await tokenRes.json()) as {
      refresh_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenRes.ok || !tokenData.refresh_token) {
      logger.warn(
        { status: tokenRes.status, error: tokenData.error, desc: tokenData.error_description },
        "gcal: token exchange failed — no refresh_token returned",
      );
      res.redirect("/?gcal=error");
      return;
    }

    await db
      .insert(settingsTable)
      .values({
        id: 1,
        googleRefreshToken: tokenData.refresh_token,
      } as typeof settingsTable.$inferInsert)
      .onConflictDoUpdate({
        target: settingsTable.id,
        set: { googleRefreshToken: tokenData.refresh_token },
      });

    logger.info("gcal: OAuth refresh token stored successfully");
    res.redirect("/?gcal=connected");
  } catch (err) {
    logger.error({ err }, "gcal: token exchange threw an error");
    res.redirect("/?gcal=error");
  }
});

export default router;
