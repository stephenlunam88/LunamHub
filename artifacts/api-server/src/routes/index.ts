// Main routes index — registers all feature routers under /api
import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import { familyRouter } from "./family";
import { eventsRouter } from "./events";
import { choresRouter } from "./chores";
import { rewardsRouter } from "./rewards";
import { redemptionsRouter } from "./redemptions";
import { listsRouter } from "./lists";
import { mealsRouter } from "./meals";
import { mealPlanRouter } from "./mealplan";
import { routinesRouter } from "./routines";
import { dashboardRouter } from "./dashboard";
import { settingsRouter } from "./settings";
import { badgesRouter } from "./badges";
import { pointTransactionsRouter } from "./point-transactions";
import { leaderboardRouter } from "./leaderboard";
import { streakMilestonesRouter } from "./streakMilestones";
import { screensaverPhotosRouter } from "./screensaverPhotos";
import { pointMilestonesRouter } from "./pointMilestones";
import { choreMilestonesRouter } from "./choreMilestones";
import storageRouter from "./storage";
import googleAuthRouter from "./google-auth";
import { gamesNightRouter } from "./games-night";
import { googleNestRouter } from "./google-nest";
import { weatherRouter } from "./weather";
import { requireAuth } from "../middleware/requireAuth";

const router: IRouter = Router();

// Public — health check and auth endpoints (no login required)
router.use(healthRouter);
router.use("/auth", authRouter);

// Everything below requires a valid session when APP_PASSWORD is set
router.use(requireAuth);

router.use("/family", familyRouter);
router.use("/events", eventsRouter);
router.use("/chores", choresRouter);
router.use("/rewards", rewardsRouter);
router.use("/redemptions", redemptionsRouter);
router.use("/lists", listsRouter);
router.use("/meals", mealsRouter);
router.use("/meal-plan", mealPlanRouter);
router.use("/routines", routinesRouter);
router.use("/dashboard", dashboardRouter);
router.use("/settings", settingsRouter);
router.use("/badges", badgesRouter);
router.use("/point-transactions", pointTransactionsRouter);
router.use("/leaderboard", leaderboardRouter);
router.use("/streak-milestones", streakMilestonesRouter);
router.use("/screensaver-photos", screensaverPhotosRouter);
router.use("/point-milestones", pointMilestonesRouter);
router.use("/chore-milestones", choreMilestonesRouter);
router.use("/games-night", gamesNightRouter);
router.use("/google-nest", googleNestRouter);
router.use("/weather", weatherRouter);
router.use(storageRouter);
router.use(googleAuthRouter);

export default router;
