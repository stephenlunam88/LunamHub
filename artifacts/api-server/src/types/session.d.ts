import "express-session";

declare module "express-session" {
  interface SessionData {
    authenticated?: boolean;
    parentVerifiedUntil?: number;
    googleCalendarOAuth?: { state: string; expiresAt: number };
  }
}
