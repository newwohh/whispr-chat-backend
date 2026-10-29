import { describe, it, expect } from "bun:test";
import {
  saveMessage,
  getMessages,
  getUserConversations,
  generateDirectRoomId,
  checkMongoConnection,
} from "../src/db/mongodb";

describe("MongoStorageTests", () => {
  it("should save and retrieve messages", async () => {
    const room = "test_bun_storage_" + Date.now();
    const msg = await saveMessage({
      room_id: room,
      sender_id: "nevin",
      text: "Hello Bun test!",
      recipient_id: "bob",
    });

    expect(msg.id).toBeDefined();
    expect(msg.senderId).toBe("nevin");
    expect(msg.text).toBe("Hello Bun test!");

    const messages = await getMessages(room);
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0].text).toBe("Hello Bun test!");
  });

  it("should generate deterministic direct room id regardless of user order", () => {
    const room1 = generateDirectRoomId("alice", "bob");
    const room2 = generateDirectRoomId("bob", "alice");
    expect(room1).toBe(room2);
    expect(room1).toBe(Array.from("alicebob").sort().join(""));
  });

  it("should list user conversations", async () => {
    const uniqueRoom = "room_conv_" + Date.now();
    await saveMessage({
      room_id: uniqueRoom,
      sender_id: "userA",
      text: "Hi B from Bun",
      recipient_id: "userB",
    });

    const convs = await getUserConversations("userA");
    expect(convs.some((c) => c.room_id === uniqueRoom)).toBe(true);
  });

  it("should check mongo connection health", async () => {
    const health = await checkMongoConnection();
    expect(health.status).toBe("connected");
    expect(health.database).toBe("whispr");
    expect(typeof health.message_count).toBe("number");
  });
});
