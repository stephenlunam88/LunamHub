import app from "./app";
import { logger } from "./lib/logger";
import { ensureGamesNightSchema } from "./lib/gamesNightMigration";
import { ensureSessionSchema } from "./lib/postgresSessionStore";
import { startCalendarPolling } from "./lib/calendarPolling";
import { ensureMcpOAuthSchema } from "./lib/mcpOAuth";
import { ensureAssistantConfigSchema } from "./lib/assistantConfig";
import { ensureChoreSchema } from "./lib/choreSchema";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

Promise.all([
  ensureGamesNightSchema(),
  ensureSessionSchema(),
  ensureMcpOAuthSchema(),
  ensureAssistantConfigSchema(),
  ensureChoreSchema(),
])
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening");
      startCalendarPolling();
    });
  })
  .catch((err) => {
    logger.error({ err }, "API database schema initialization failed");
    process.exit(1);
  });
