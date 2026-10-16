import type { NextFunction, Request, Response } from "express";

export const PARENT_VERIFICATION_TTL_MS = 15 * 60 * 1000;

export function requireParentVerification(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if ((req.session.parentVerifiedUntil ?? 0) > Date.now()) {
    next();
    return;
  }
  res.status(403).json({ error: "Parent PIN verification required" });
}
