import { Hono } from "hono";
import { checkMongoConnection } from "../db/mongodb";

export const healthRouter = new Hono();

healthRouter.get("/health", async (c) => {
  const mongoStatus = await checkMongoConnection();
  return c.json({
    status: "healthy",
    websocket_support: true,
    mongodb: mongoStatus,
  }, 200);
});
