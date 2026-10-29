import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authRouter } from "./routes/auth.routes";
import { chatRouter } from "./routes/chat.routes";
import { healthRouter } from "./routes/health.routes";

export const app = new Hono();

// Global Middlewares
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

// Mount API routes under /api
app.route("/api", authRouter);
app.route("/api", chatRouter);
app.route("/api", healthRouter);

// Root fallback / index info
app.get("/", (c) => {
  return c.json({
    name: "Whispr Backend (Bun.js)",
    status: "running",
    version: "1.0.0",
    docs: "/api/health",
  });
});

/**
 * Normalizes request paths so trailing slashes (/api/messages/) and
 * non-trailing slashes (/api/messages) route identically without redirects.
 */
export function handleHttpRequest(req: Request): Response | Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
    const newReq = new Request(url.toString(), req);
    return app.fetch(newReq);
  }
  return app.fetch(req);
}
