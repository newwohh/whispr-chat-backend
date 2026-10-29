import { Hono } from "hono";
import {
  saveMessage,
  getMessages,
  getUserConversations,
  getAllChats,
  generateDirectRoomId,
} from "../db/mongodb";
import { broadcastToRoom } from "../websocket/pubsub";

export const chatRouter = new Hono();

// Helper to broadcast chat messages to WebSocket subscribers
function broadcastMessage(roomId: string, messageData: any) {
  broadcastToRoom(roomId, {
    type: "chat_message",
    id: messageData.id,
    text: messageData.text,
    message: messageData.text,
    senderId: messageData.senderId,
    username: messageData.senderId,
    recipientId: messageData.recipientId || null,
    date: messageData.date,
    room_id: roomId,
  });
}

// World chat / backward compatible message endpoint
chatRouter.get("/messages", async (c) => {
  const roomId = c.req.query("room") || "world";
  const limit = parseInt(c.req.query("limit") || "100", 10);
  const messages = await getMessages(roomId, limit);
  return c.json({
    room: roomId,
    messages,
  }, 200);
});

chatRouter.post("/messages", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const username = body.username || body.senderId || "Anonymous";
  const text = body.message || body.text || "";
  const roomId = body.room || body.room_id || "world";
  const msgId = body.id;
  const dateStr = body.date;

  if (!text.trim()) {
    return c.json({ error: "Message text is required" }, 400);
  }

  const saved = await saveMessage({
    room_id: roomId,
    sender_id: username,
    text,
    message_id: msgId,
    date: dateStr,
  });

  broadcastMessage(roomId, saved);
  return c.json(saved, 201);
});

// List conversations
chatRouter.get("/chats", async (c) => {
  const username = c.req.query("username");
  const conversations = username
    ? await getUserConversations(username)
    : await getAllChats();

  return c.json({
    conversations,
  }, 200);
});

// Room messages
chatRouter.get("/chats/:room_id/messages", async (c) => {
  const roomId = c.req.param("room_id");
  const limit = parseInt(c.req.query("limit") || "100", 10);
  const messages = await getMessages(roomId, limit);
  return c.json({
    room_id: roomId,
    messages,
  }, 200);
});

chatRouter.post("/chats/:room_id/messages", async (c) => {
  const roomId = c.req.param("room_id");
  const body = await c.req.json().catch(() => ({}));
  const sender = body.senderId || body.username || "Anonymous";
  const text = body.text || body.message || "";
  const recipient = body.recipientId || body.recipient || null;
  const msgId = body.id;
  const dateStr = body.date;

  if (!text.trim()) {
    return c.json({ error: "Message cannot be empty" }, 400);
  }

  const saved = await saveMessage({
    room_id: roomId,
    sender_id: sender,
    text,
    recipient_id: recipient,
    message_id: msgId,
    date: dateStr,
  });

  broadcastMessage(roomId, saved);
  return c.json({
    message: saved,
    status: "success",
  }, 201);
});

// 1-on-1 Direct messages
chatRouter.get("/chats/direct/:other_user/messages", async (c) => {
  const otherUser = c.req.param("other_user");
  const currentUser = c.req.query("user");

  if (!currentUser) {
    return c.json(
      { error: "User query parameter is required (e.g. ?user=username)" },
      400
    );
  }

  const roomId = generateDirectRoomId(currentUser, otherUser);
  const limit = parseInt(c.req.query("limit") || "100", 10);
  const messages = await getMessages(roomId, limit);

  return c.json({
    room_id: roomId,
    participants: [currentUser, otherUser],
    messages,
  }, 200);
});

chatRouter.post("/chats/direct/:other_user/messages", async (c) => {
  const otherUser = c.req.param("other_user");
  const body = await c.req.json().catch(() => ({}));
  const currentUser = body.senderId || body.username;
  const text = body.text || body.message || "";

  if (!currentUser) {
    return c.json({ error: "senderId or username is required" }, 400);
  }
  if (!text.trim()) {
    return c.json({ error: "Message text is required" }, 400);
  }

  const roomId = generateDirectRoomId(currentUser, otherUser);
  const saved = await saveMessage({
    room_id: roomId,
    sender_id: currentUser,
    text,
    recipient_id: otherUser,
  });

  broadcastMessage(roomId, saved);
  return c.json({
    room_id: roomId,
    message: saved,
    status: "success",
  }, 201);
});
