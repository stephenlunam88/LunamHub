import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { PostgresSessionStore } from "./lib/postgresSessionStore";
import { mountMcpIntegration } from "./lib/mcpOAuth";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
const allowedOrigins = process.env["CORS_ORIGIN"]
  ?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins?.length ? allowedOrigins : false,
    credentials: true,
  }),
);
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true }));

const secret = process.env["SESSION_SECRET"] ?? "dev-secret-change-me";
if (
  process.env["NODE_ENV"] === "production" &&
  !process.env["SESSION_SECRET"]
) {
  throw new Error("SESSION_SECRET is required in production");
}
app.use(
  session({
    name: "lunam.sid",
    secret,
    store: new PostgresSessionStore(),
    // Cloudflare supplies the visitor-facing X-Forwarded-Proto value, which
    // Nginx preserves for the API. This keeps cookies Secure on HTTPS while
    // still allowing direct HTTP access on a trusted local network.
    proxy: process.env["NODE_ENV"] === "production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env["NODE_ENV"] === "production" ? "auto" : false,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  }),
);

mountMcpIntegration(app);
app.use("/api", router);

export default app;
