import type { Request, Response, NextFunction } from "express";

/**
 * Blocks unauthenticated requests when APP_PASSWORD is set.
 * If APP_PASSWORD is not configured auth is disabled and all requests pass through.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!process.env["APP_PASSWORD"]) return next(); // auth disabled
  if (req.session?.authenticated === true) return next();
  res.status(401).json({ error: "Unauthorized" });
}
