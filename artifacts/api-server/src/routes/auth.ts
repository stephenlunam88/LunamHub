import { Router } from "express";
import { logger } from "../lib/logger";

const router = Router();

// GET /api/auth/status
router.get("/status", (req, res) => {
  const passwordRequired = !!process.env["APP_PASSWORD"];
  const authenticated = !passwordRequired || req.session?.authenticated === true;
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
  if (!password || password !== appPassword) {
    res.status(401).json({ error: "Incorrect password" });
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

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) logger.error({ err }, "Session destroy error");
    res.clearCookie("lunam.sid");
    res.json({ ok: true });
  });
});

export default router;
