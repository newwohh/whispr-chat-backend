import type { ServerWebSocket } from "bun";
import type { WebSocketSessionData } from "../types";
import { saveMessage, getMessages, sanitizeGroupName } from "../db/mongodb";
import { broadcastToRoom } from "./pubsub";

export const websocketHandler = {
  open(ws: ServerWebSocket<WebSocketSessionData>) {
    const { room, topic } = ws.data;
    ws.subscribe(topic);

    // Send connection established confirmation
    ws.send(
      JSON.stringify({
        type: "connection_established",
        room: room,
        message: `Connected to ${room} chat room`,
      })
    );
  },

  async message(ws: ServerWebSocket<WebSocketSessionData>, rawMessage: string | Buffer) {
    const textData = typeof rawMessage === "string" ? rawMessage : rawMessage.toString("utf8");
    if (!textData.trim()) return;

    let payload: any;
    try {
      payload = JSON.parse(textData);
    } catch {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Invalid JSON format",
        })
      );
      return;
    }

    const { room, topic } = ws.data;
    const msgType = payload.type || "chat_message";

    // Handle ping
    if (msgType === "ping") {
      ws.send(JSON.stringify({ type: "pong" }));
      return;
    }

    // Handle typing indicator (publish to everyone in topic EXCEPT sender)
    if (msgType === "typing") {
      const username = payload.username || payload.senderId || "Anonymous";
      const isTyping = payload.is_typing !== undefined ? payload.is_typing : true;

      const typingEvent = JSON.stringify({
        type: "typing",
        username,
        is_typing: isTyping,
        room,
      });

      // ws.publish sends to everyone subscribed to topic except ws itself
      ws.publish(topic, typingEvent);
      return;
    }

    // Handle history fetch
    if (msgType === "fetch_history") {
      const limit = parseInt(payload.limit || "100", 10);
      const messages = await getMessages(room, limit);
      ws.send(
        JSON.stringify({
          type: "history",
          room,
          messages,
        })
      );
      return;
    }

    // Handle chat message
    if (msgType === "chat_message" || msgType === "message") {
      const text = payload.text || payload.message || "";
      const sender = payload.senderId || payload.username || "Anonymous";
      const recipient = payload.recipientId || payload.recipient || null;
      const customId = payload.id;
      const dateStr = payload.date;

      if (!text.trim()) return;

      const saved = await saveMessage({
        room_id: room,
        sender_id: sender,
        text,
        recipient_id: recipient,
        message_id: customId,
        date: dateStr,
      });

      const broadcastData = {
        type: "chat_message",
        id: saved.id,
        text: saved.text,
        message: saved.text,
        senderId: saved.senderId,
        username: saved.senderId,
        recipientId: saved.recipientId || null,
        date: saved.date,
        room_id: room,
      };

      // Broadcast to all participants including sender
      broadcastToRoom(room, broadcastData);
      // Ensure the sender receives it even if not delivered by publish self
      ws.send(JSON.stringify(broadcastData));
    }
  },

  close(ws: ServerWebSocket<WebSocketSessionData>, code: number, reason: string) {
    ws.unsubscribe(ws.data.topic);
  },
};
