import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { handleHttpRequest } from "../src/app";
import { websocketHandler } from "../src/websocket/handler";
import { setBunServer } from "../src/websocket/pubsub";
import { sanitizeGroupName } from "../src/db/mongodb";

describe("WebSocketTests", () => {
  let server: any;
  let testPort: number;

  beforeAll(() => {
    testPort = 9100 + Math.floor(Math.random() * 800);
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

  function createSocketClient(path: string): Promise<{
    ws: WebSocket;
    received: any[];
    waitForMessage: (predicate: (msg: any) => boolean, timeoutMs?: number) => Promise<any>;
  }> {
    return new Promise((resolve, reject) => {
      const wsUrl = `ws://127.0.0.1:${testPort}${path}`;
      const ws = new WebSocket(wsUrl);
      const received: any[] = [];

      ws.onmessage = (event) => {
        try {
          received.push(JSON.parse(event.data.toString()));
        } catch {
          received.push(event.data.toString());
        }
      };

      const timer = setTimeout(() => {
        reject(new Error(`WebSocket connection timeout to ${wsUrl}`));
      }, 3000);

      ws.onopen = () => {
        clearTimeout(timer);
        resolve({
          ws,
          received,
          waitForMessage: async (predicate, timeoutMs = 2000) => {
            const start = Date.now();
            while (Date.now() - start < timeoutMs) {
              const found = received.find(predicate);
              if (found) return found;
              await Bun.sleep(20);
            }
            throw new Error("Timed out waiting for expected WebSocket message");
          },
        });
      };

      ws.onerror = (err) => {
        clearTimeout(timer);
        reject(err);
      };
    });
  }

  it("should connect to default /ws/chat and receive world room welcome", async () => {
    const client = await createSocketClient("/ws/chat/");
    const welcome = await client.waitForMessage((m) => m.type === "connection_established");

    expect(welcome.room).toBe("world");
    expect(welcome.message).toBe("Connected to world chat room");
    client.ws.close();
  });

  it("should connect to named room and respond to ping with pong", async () => {
    const client = await createSocketClient("/ws/chat/pingroom/");
    await client.waitForMessage((m) => m.type === "connection_established");

    client.ws.send(JSON.stringify({ type: "ping" }));
    const pong = await client.waitForMessage((m) => m.type === "pong");
    expect(pong.type).toBe("pong");
    client.ws.close();
  });

  it("should broadcast messages to clients in the same room while isolating other rooms", async () => {
    const roomA = `room_iso_a_${Date.now()}`;
    const roomB = `room_iso_b_${Date.now()}`;

    const clientA1 = await createSocketClient(`/ws/chat/${roomA}/`);
    const clientA2 = await createSocketClient(`/ws/chat/${roomA}/`);
    const clientB = await createSocketClient(`/ws/chat/${roomB}/`);

    await clientA1.waitForMessage((m) => m.type === "connection_established");
    await clientA2.waitForMessage((m) => m.type === "connection_established");
    await clientB.waitForMessage((m) => m.type === "connection_established");

    const messageText = "Broadcasting to room A only!";
    clientA1.ws.send(
      JSON.stringify({
        type: "chat_message",
        senderId: "alice",
        text: messageText,
      })
    );

    // Client A2 in roomA must receive the message
    const msgA2 = await clientA2.waitForMessage(
      (m) => m.type === "chat_message" && m.text === messageText
    );
    expect(msgA2.senderId).toBe("alice");
    expect(msgA2.room_id).toBe(roomA);

    // Client B in roomB should NOT receive the message
    await Bun.sleep(150);
    const msgB = clientB.received.find(
      (m) => m.type === "chat_message" && m.text === messageText
    );
    expect(msgB).toBeUndefined();

    clientA1.ws.close();
    clientA2.ws.close();
    clientB.ws.close();
  });

  it("should broadcast typing indicators to room peers but not back to sender", async () => {
    const room = `room_typing_${Date.now()}`;
    const sender = await createSocketClient(`/ws/chat/${room}/`);
    const listener = await createSocketClient(`/ws/chat/${room}/`);

    await sender.waitForMessage((m) => m.type === "connection_established");
    await listener.waitForMessage((m) => m.type === "connection_established");

    sender.ws.send(
      JSON.stringify({
        type: "typing",
        username: "writer_user",
        is_typing: true,
      })
    );

    const typingMsg = await listener.waitForMessage(
      (m) => m.type === "typing" && m.username === "writer_user"
    );
    expect(typingMsg.is_typing).toBe(true);
    expect(typingMsg.room).toBe(room);

    // Sender should NOT have received the typing event
    const senderTyping = sender.received.find(
      (m) => m.type === "typing" && m.username === "writer_user"
    );
    expect(senderTyping).toBeUndefined();

    sender.ws.close();
    listener.ws.close();
  });

  it("should fetch history over socket", async () => {
    const room = `room_hist_${Date.now()}`;
    const client = await createSocketClient(`/ws/chat/${room}/`);
    await client.waitForMessage((m) => m.type === "connection_established");

    // Send a message first
    client.ws.send(
      JSON.stringify({
        type: "chat_message",
        senderId: "hist_user",
        text: "History message 1",
      })
    );
    await client.waitForMessage((m) => m.type === "chat_message" && m.text === "History message 1");

    // Request history
    client.ws.send(JSON.stringify({ type: "fetch_history", limit: 10 }));
    const history = await client.waitForMessage((m) => m.type === "history");

    expect(history.room).toBe(room);
    expect(Array.isArray(history.messages)).toBe(true);
    expect(history.messages.some((m: any) => m.text === "History message 1")).toBe(true);

    client.ws.close();
  });

  it("should receive real-time broadcast when message is posted via REST API", async () => {
    const room = `room_rest_ws_${Date.now()}`;
    const client = await createSocketClient(`/ws/chat/${room}/`);
    await client.waitForMessage((m) => m.type === "connection_established");

    // Post message via HTTP REST API
    const restPost = new Request(`http://127.0.0.1:${testPort}/api/chats/${room}/messages/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        senderId: "rest_sender",
        text: "Sent via HTTP, received via WebSocket!",
      }),
    });
    const postRes = await handleHttpRequest(restPost);
    expect(postRes.status).toBe(201);

    // WebSocket client should receive the broadcast immediately
    const wsBroadcast = await client.waitForMessage(
      (m) => m.type === "chat_message" && m.text === "Sent via HTTP, received via WebSocket!"
    );
    expect(wsBroadcast.senderId).toBe("rest_sender");
    expect(wsBroadcast.room_id).toBe(room);

    client.ws.close();
  });

  it("should return error frame when invalid JSON is sent", async () => {
    const client = await createSocketClient(`/ws/chat/err_room/`);
    await client.waitForMessage((m) => m.type === "connection_established");

    client.ws.send("{not valid json syntax");
    const err = await client.waitForMessage((m) => m.type === "error");
    expect(err.message).toBe("Invalid JSON format");

    client.ws.close();
  });
});
