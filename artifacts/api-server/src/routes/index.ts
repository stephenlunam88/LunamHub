// Main routes index — registers all feature routers under /api
import { Router, type IRouter } from "express";
import healthRouter from "./health";
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
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
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
router.use(storageRouter);

export default router;
