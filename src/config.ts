import { resolve } from "path";

export const CONFIG = {
  PORT: parseInt(process.env.PORT || "8000", 10),
  HOST: process.env.HOST || "0.0.0.0",
  SECRET_KEY: process.env.SECRET_KEY || "django-insecure-7a=^x7on1onnp0w&u4asc03*=al!25yng0nus!0t5ullwg+z%$",
  SQLITE_PATH: process.env.SQLITE_PATH || resolve(process.cwd(), "db.sqlite3"),
  MONGODB_URI: process.env.MONGODB_URI || "mongodb://localhost:27017",
  MONGODB_DB_NAME: process.env.MONGODB_DB_NAME || "whispr",
  REDIS_URL: process.env.REDIS_URL || "redis://127.0.0.1:6379/0",
  USE_IN_MEMORY_CHANNEL_LAYER: (process.env.USE_IN_MEMORY_CHANNEL_LAYER || "false").toLowerCase() === "true",
  JWT_ACCESS_EXPIRATION_SECONDS: 60 * 60 * 24, // 1 day
  JWT_REFRESH_EXPIRATION_SECONDS: 60 * 60 * 24 * 7, // 7 days
};
