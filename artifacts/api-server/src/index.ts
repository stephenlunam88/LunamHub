import app from "./app";
import { logger } from "./lib/logger";
import { ensureGamesNightSchema } from "./lib/gamesNightMigration";
import { ensureSessionSchema } from "./lib/postgresSessionStore";
import { startCalendarPolling } from "./lib/calendarPolling";

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

Promise.all([ensureGamesNightSchema(), ensureSessionSchema()])
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
    logger.error({ err }, "Games Night database migration failed");
    process.exit(1);
  });
