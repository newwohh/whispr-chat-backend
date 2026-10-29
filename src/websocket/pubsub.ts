import type { Server } from "bun";
import Redis from "ioredis";
import { CONFIG } from "../config";
import { sanitizeGroupName } from "../db/mongodb";

let bunServer: Server<any> | null = null;
let redisPub: Redis | null = null;
let redisSub: Redis | null = null;

export function setBunServer(server: Server<any>) {
  bunServer = server;
}

export function initRedisPubSub() {
  if (CONFIG.USE_IN_MEMORY_CHANNEL_LAYER) {
    return;
  }

  try {
    redisPub = new Redis(CONFIG.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      retryStrategy: () => null, // don't spam if Redis isn't running
    });
    redisSub = new Redis(CONFIG.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      retryStrategy: () => null,
    });

    redisPub.connect().catch(() => {
      // In-memory fallback if Redis fails to connect
      redisPub = null;
    });

    redisSub.connect().then(() => {
      redisSub?.psubscribe("chat_*", (err) => {
        if (err) console.warn("Redis psubscribe warning:", err);
      });

      redisSub?.on("pmessage", (_pattern, channel, message) => {
        if (bunServer) {
          bunServer.publish(channel, message);
        }
      });
    }).catch(() => {
      redisSub = null;
    });
  } catch (err) {
    console.warn("Redis pub/sub initialization fallback to in-memory:", err);
  }
}

export function broadcastToRoom(roomId: string, messageData: any) {
  const topic = sanitizeGroupName(roomId);
  const payloadStr = typeof messageData === "string" ? messageData : JSON.stringify(messageData);

  // Broadcast locally via Bun native pub/sub
  if (bunServer) {
    bunServer.publish(topic, payloadStr);
  }

  // Also publish to Redis if available
  if (redisPub && redisPub.status === "ready") {
    redisPub.publish(topic, payloadStr).catch((e) => {
      console.warn("Redis publish error:", e);
    });
  }
}
