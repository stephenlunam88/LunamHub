import "express-session";

declare module "express-session" {
  interface SessionData {
    authenticated?: boolean;
    parentVerifiedUntil?: number;
    googleCalendarOAuth?: { state: string; expiresAt: number };
    assistantPending?: {
      id: string;
      expiresAt: number;
      messages: Array<Record<string, unknown>>;
      toolCalls: Array<{
        id: string;
        name: string;
        arguments: Record<string, unknown>;
      }>;
      displayActions: Array<{
        name: string;
        arguments: Record<string, unknown>;
        assignedNames?: string[];
      }>;
    };
  }
}
