import { syncCalendarRange } from "../routes/events";
import { householdDate } from "./householdDate";
import { logger } from "./logger";

/** Keep the dashboard current even if nobody opens the Calendar page. */
export function startCalendarPolling() {
  if (!process.env.GOOGLE_OAUTH_CLIENT_ID) return;
  let running = false;
  const poll = async () => {
    if (running) return;
    running = true;
    try {
      const today = householdDate();
      const end = new Date(`${today}T12:00:00Z`);
      end.setUTCDate(end.getUTCDate() + 90);
      await syncCalendarRange({
        startDate: `${today.slice(0, 7)}-01`,
        endDate: end.toISOString().slice(0, 10),
      });
    } catch (error) {
      logger.warn(
        { err: error },
        "Background calendar sync failed; will retry in five minutes",
      );
    } finally {
      running = false;
    }
  };
  void poll();
  const timer = setInterval(() => void poll(), 5 * 60_000);
  timer.unref();
}
