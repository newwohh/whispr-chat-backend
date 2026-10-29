import { CONFIG } from "./config";
import { handleHttpRequest } from "./app";
import { websocketHandler } from "./websocket/handler";
import { setBunServer, initRedisPubSub } from "./websocket/pubsub";
import { sanitizeGroupName } from "./db/mongodb";

console.log(`Starting Whispr Bun Server on ${CONFIG.HOST}:${CONFIG.PORT}...`);

const server = Bun.serve({
  port: CONFIG.PORT,
  hostname: CONFIG.HOST,
  fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket route matching: /ws/chat/ or /ws/chat/<room_name>/
    if (url.pathname.startsWith("/ws/chat")) {
      const match = url.pathname.match(/^\/ws\/chat(?:\/([\w\-]+))?\/?$/);
      if (match) {
        const room = match[1] || "world";
        const topic = sanitizeGroupName(room);

        const upgraded = server.upgrade(req, {
          data: {
            room,
            topic,
            sessionId: crypto.randomUUID(),
          },
        });

        if (upgraded) {
          return undefined;
        }
      }
    }

    // HTTP Request handling
    return handleHttpRequest(req);
  },
  websocket: websocketHandler,
});

setBunServer(server);
initRedisPubSub();

console.log(`🚀 Whispr Backend (Bun.js) listening on http://${server.hostname}:${server.port}`);
console.log(`📡 WebSocket endpoint available at ws://${server.hostname}:${server.port}/ws/chat/<room_name>/`);
