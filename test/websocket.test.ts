import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { handleHttpRequest } from "../src/app";
import { websocketHandler } from "../src/websocket/handler";
import { setBunServer } from "../src/websocket/pubsub";
import { sanitizeGroupName } from "../src/db/mongodb";

describe("WebSocketTests", () => {
  let server: any;
  let testPort: number;

  beforeAll(() => {
    testPort = 9000 + Math.floor(Math.random() * 900);
    server = Bun.serve({
      port: testPort,
      hostname: "127.0.0.1",
      fetch(req, server) {
        const url = new URL(req.url);
        if (url.pathname.startsWith("/ws/chat")) {
          const match = url.pathname.match(/^\/ws\/chat(?:\/([\w\-]+))?\/?$/);
          const room = match && match[1] ? match[1] : "world";
          const topic = sanitizeGroupName(room);

          const upgraded = server.upgrade(req, {
            data: {
              room,
              topic,
              sessionId: crypto.randomUUID(),
            },
          });
          if (upgraded) return undefined;
        }
        return handleHttpRequest(req);
      },
      websocket: websocketHandler,
    });
    setBunServer(server);
  });

  afterAll(() => {
    server.stop();
  });

  it("should connect to websocket, receive welcome, ping/pong, and chat message", async () => {
    const wsUrl = `ws://127.0.0.1:${testPort}/ws/chat/testroom/`;
    const ws = new WebSocket(wsUrl);

    const received: any[] = [];
    ws.onmessage = (event) => {
      received.push(JSON.parse(event.data.toString()));
    };

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = (e) => reject(e);
      setTimeout(() => reject(new Error("WS connection timeout")), 2000);
    });

    // Wait for connection_established message
    await Bun.sleep(100);
    expect(received.length).toBeGreaterThanOrEqual(1);
    expect(received[0].type).toBe("connection_established");
    expect(received[0].room).toBe("testroom");

    // Test ping / pong
    ws.send(JSON.stringify({ type: "ping" }));
    await Bun.sleep(100);
    expect(received.some((m) => m.type === "pong")).toBe(true);

    // Test chat message
    const testMsgText = "WebSocket is real-time in Bun!";
    ws.send(
      JSON.stringify({
        type: "chat_message",
        senderId: "socket_user_bun",
        text: testMsgText,
      })
    );

    await Bun.sleep(150);
    const chatMsg = received.find(
      (m) => m.type === "chat_message" && m.text === testMsgText
    );
    expect(chatMsg).toBeDefined();
    expect(chatMsg.senderId).toBe("socket_user_bun");
    expect(chatMsg.room_id).toBe("testroom");

    ws.close();
  });
});
