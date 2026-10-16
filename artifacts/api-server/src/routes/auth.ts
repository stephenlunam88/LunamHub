import { Router } from "express";
import { logger } from "../lib/logger";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  clearLoginFailures,
  isLoginBlocked,
  recordLoginFailure,
} from "../lib/loginThrottle";

const router = Router();

// GET /api/auth/status
router.get("/status", (req, res) => {
  const passwordRequired = !!process.env["APP_PASSWORD"];
  const authenticated =
    !passwordRequired || req.session?.authenticated === true;
  res.json({ passwordRequired, authenticated });
});

// POST /api/auth/login
router.post("/login", (req, res) => {
  const appPassword = process.env["APP_PASSWORD"];
  if (!appPassword) {
    // Auth disabled — always succeed
    res.json({ ok: true });
    return;
  }

  const { password } = req.body as { password?: string };
  const throttleKey = `app:${req.ip}`;
  if (isLoginBlocked(throttleKey)) {
    res
      .status(429)
      .json({ error: "Too many login attempts. Try again later." });
    return;
  }
  const supplied = createHash("sha256")
    .update(password ?? "")
    .digest();
  const expected = createHash("sha256").update(appPassword).digest();
  if (!password || !timingSafeEqual(supplied, expected)) {
    recordLoginFailure(throttleKey);
    res.status(401).json({ error: "Incorrect password" });
    return;
  }

  clearLoginFailures(throttleKey);
  req.session.regenerate((regenerateError) => {
    if (regenerateError) {
      logger.error({ err: regenerateError }, "Session regeneration error");
      res.status(500).json({ error: "Session error" });
      return;
    }
    req.session.authenticated = true;
    req.session.save((err) => {
      if (err) {
        logger.error({ err }, "Session save error");
        res.status(500).json({ error: "Session error" });
        return;
      }
      res.json({ ok: true });
    });
  });
});

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) logger.error({ err }, "Session destroy error");
    res.clearCookie("lunam.sid");
    res.json({ ok: true });
  });
});

export default router;
