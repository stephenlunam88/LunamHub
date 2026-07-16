import { randomBytes } from "node:crypto";
import { Router } from "express";
import {
  disconnectNest,
  getNestConfig,
  isNestConnected,
  nestRequest,
  storeNestRefreshToken,
} from "../lib/google-nest";
import { logger } from "../lib/logger";

export const googleNestRouter = Router();

type NestDevice = {
  name: string;
  type: string;
  traits?: Record<string, unknown>;
  parentRelations?: Array<{ parent: string; displayName: string }>;
};

function sessionData(req: Parameters<typeof googleNestRouter.get>[1] extends never ? never : any) {
  return req.session as typeof req.session & { nestOAuthState?: string };
}

googleNestRouter.get("/status", async (_req, res) => {
  const configured = getNestConfig() !== null;
  const connected = configured ? await isNestConnected() : false;
  res.json({ configured, connected });
});

googleNestRouter.get("/connect", (req, res): void => {
  const config = getNestConfig();
  if (!config) {
    res.status(503).json({ error: "Google Nest Device Access is not configured." });
    return;
  }
  const state = randomBytes(24).toString("hex");
  sessionData(req).nestOAuthState = state;
  const url = new URL(
    `https://nestservices.google.com/partnerconnections/${encodeURIComponent(config.projectId)}/auth`,
  );
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/sdm.service");
  url.searchParams.set("state", state);
  res.redirect(url.toString());
});

googleNestRouter.get("/callback", async (req, res): Promise<void> => {
  const config = getNestConfig();
  const code = typeof req.query.code === "string" ? req.query.code : null;
  const state = typeof req.query.state === "string" ? req.query.state : null;
  const expectedState = sessionData(req).nestOAuthState;
  delete sessionData(req).nestOAuthState;

  if (!config || !code || !state || state !== expectedState) {
    res.redirect("/admin?nest=error");
    return;
  }
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
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
    const data = (await response.json()) as {
      refresh_token?: string;
      error?: string;
    };
    if (!response.ok || !data.refresh_token) {
      logger.warn({ status: response.status, error: data.error }, "nest: token exchange failed");
      res.redirect("/admin?nest=error");
      return;
    }
    await storeNestRefreshToken(data.refresh_token);
    res.redirect("/admin?nest=connected");
  } catch (error) {
    logger.error({ error }, "nest: OAuth callback failed");
    res.redirect("/admin?nest=error");
  }
});

googleNestRouter.post("/disconnect", async (_req, res) => {
  await disconnectNest();
  res.json({ configured: getNestConfig() !== null, connected: false });
});

googleNestRouter.get("/devices", async (_req, res): Promise<void> => {
  const config = getNestConfig();
  if (!config) {
    res.status(503).json({ error: "Google Nest is not configured." });
    return;
  }
  const response = await nestRequest(
    `/enterprises/${encodeURIComponent(config.projectId)}/devices`,
  );
  if (!response) {
    res.status(401).json({ error: "Google Nest is not connected." });
    return;
  }
  if (!response.ok) {
    res.status(response.status).json({ error: "Google Nest devices could not be loaded." });
    return;
  }
  const data = (await response.json()) as { devices?: NestDevice[] };
  const devices = (data.devices ?? [])
    .filter((device) =>
      ["sdm.devices.types.CAMERA", "sdm.devices.types.DOORBELL", "sdm.devices.types.DISPLAY"].includes(device.type),
    )
    .map((device) => {
      const info = device.traits?.["sdm.devices.traits.Info"] as
        | { customName?: string }
        | undefined;
      const live = device.traits?.["sdm.devices.traits.CameraLiveStream"] as
        | { supportedProtocols?: string[]; maxVideoResolution?: { width?: number; height?: number } }
        | undefined;
      return {
        id: device.name.split("/").pop(),
        name: info?.customName || device.parentRelations?.[0]?.displayName || "Nest camera",
        type: device.type.split(".").pop(),
        protocols: live?.supportedProtocols ?? [],
        maxVideoResolution: live?.maxVideoResolution ?? null,
        online: Boolean(live),
      };
    });
  res.json({ devices });
});

googleNestRouter.post("/devices/:deviceId/webrtc", async (req, res): Promise<void> => {
  const config = getNestConfig();
  const offerSdp = typeof req.body?.offerSdp === "string" ? req.body.offerSdp : "";
  if (!config || !offerSdp) {
    res.status(400).json({ error: "A valid WebRTC offer is required." });
    return;
  }
  const deviceName = `enterprises/${config.projectId}/devices/${req.params.deviceId}`;
  const response = await nestRequest(`/${deviceName}:executeCommand`, {
    method: "POST",
    body: {
      command: "sdm.devices.commands.CameraLiveStream.GenerateWebRtcStream",
      params: { offerSdp },
    },
  });
  if (!response) {
    res.status(401).json({ error: "Google Nest is not connected." });
    return;
  }
  const data = (await response.json()) as {
    results?: { answerSdp?: string; mediaSessionId?: string; expiresAt?: string };
    error?: { message?: string };
  };
  if (!response.ok || !data.results?.answerSdp) {
    res.status(response.status).json({ error: data.error?.message ?? "Live stream could not be started." });
    return;
  }
  res.json(data.results);
});

googleNestRouter.post("/devices/:deviceId/stop", async (req, res): Promise<void> => {
  const config = getNestConfig();
  const mediaSessionId =
    typeof req.body?.mediaSessionId === "string" ? req.body.mediaSessionId : "";
  if (!config || !mediaSessionId) {
    res.status(400).json({ error: "A media session ID is required." });
    return;
  }
  const deviceName = `enterprises/${config.projectId}/devices/${req.params.deviceId}`;
  const response = await nestRequest(`/${deviceName}:executeCommand`, {
    method: "POST",
    body: {
      command: "sdm.devices.commands.CameraLiveStream.StopWebRtcStream",
      params: { mediaSessionId },
    },
  });
  res.status(response?.ok ? 204 : response?.status ?? 502).end();
});
