import { MongoClient, Db } from "mongodb";
import { CONFIG } from "../config";
import type { ChatMessage, ChatConversation } from "../types";

let mongoClient: MongoClient | null = null;
let mongoDb: Db | null = null;
let indexesCreated = false;

export async function getMongoClient(): Promise<MongoClient> {
  if (!mongoClient) {
    mongoClient = new MongoClient(CONFIG.MONGODB_URI, {
      serverSelectionTimeoutMS: 2000,
      connectTimeoutMS: 2000,
    });
    await mongoClient.connect();
    // Test connection with ping
    await mongoClient.db("admin").command({ ping: 1 });
  }
  return mongoClient;
}

export async function getMongoDb(): Promise<Db> {
  if (mongoDb) {
    return mongoDb;
  }

  const client = await getMongoClient();
  mongoDb = client.db(CONFIG.MONGODB_DB_NAME);

  if (!indexesCreated) {
    try {
      await mongoDb.collection("messages").createIndex({ room_id: 1, date: 1 });
      await mongoDb.collection("messages").createIndex({ id: 1 }, { unique: true });
      await mongoDb.collection("chats").createIndex({ room_id: 1 }, { unique: true });
      await mongoDb.collection("chats").createIndex({ participants: 1 });
      indexesCreated = true;
    } catch (err) {
      console.warn("MongoDB index creation notice:", err);
    }
  }

  return mongoDb;
}

export function generateDirectRoomId(user1: string, user2: string): string {
  const combined = (user1 || "") + (user2 || "");
  return Array.from(combined).sort().join("");
}

export function sanitizeGroupName(name: string): string {
  const cleanName = String(name || "world").replace(/[^a-zA-Z0-9_\-\.]/g, "_");
  return `chat_${cleanName}`.slice(0, 95);
}

function serializeDoc<T extends Record<string, any>>(doc: T | null): T | null {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(rest)) {
    if (value instanceof Date) {
      result[key] = value.toISOString();
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item instanceof Date ? item.toISOString() : typeof item === "object" && item !== null ? serializeDoc(item) : item
      );
    } else if (typeof value === "object" && value !== null) {
      result[key] = serializeDoc(value);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

export async function saveMessage(params: {
  room_id: string;
  sender_id: string;
  text: string;
  recipient_id?: string | null;
  message_id?: string | null;
  date?: string | null;
}): Promise<ChatMessage> {
  const db = await getMongoDb();
  const now = new Date();
  const nowIso = params.date || now.toISOString();
  const msgId = params.message_id || crypto.randomUUID();

  const messageDoc = {
    id: msgId,
    room_id: params.room_id,
    senderId: params.sender_id,
    recipientId: params.recipient_id || null,
    text: params.text,
    date: nowIso,
    created_at: now,
  };

  // Upsert into messages collection
  await db.collection("messages").updateOne(
    { id: msgId },
    { $setOnInsert: messageDoc },
    { upsert: true }
  );

  // Participants list
  const participants = [params.sender_id];
  if (params.recipient_id && !participants.includes(params.recipient_id)) {
    participants.push(params.recipient_id);
  }

  // Upsert chat record
  await db.collection("chats").updateOne(
    { room_id: params.room_id },
    {
      $set: {
        room_id: params.room_id,
        last_message: {
          id: msgId,
          text: params.text,
          senderId: params.sender_id,
          date: nowIso,
        },
        updated_at: now,
      },
      $addToSet: {
        participants: { $each: participants },
      },
      $setOnInsert: {
        created_at: now,
        room_type: params.room_id === "world" ? "world" : "direct",
      },
    },
    { upsert: true }
  );

  return {
    id: msgId,
    room_id: params.room_id,
    senderId: params.sender_id,
    recipientId: params.recipient_id || null,
    text: params.text,
    date: nowIso,
  };
}

export async function getMessages(roomId: string, limit = 200, skip = 0): Promise<ChatMessage[]> {
  const db = await getMongoDb();
  const cursor = db
    .collection("messages")
    .find({ room_id: roomId }, { projection: { _id: 0 } })
    .sort({ created_at: 1 })
    .skip(skip)
    .limit(limit);

  const docs = await cursor.toArray();
  return docs.map((doc) => serializeDoc(doc) as unknown as ChatMessage);
}

export async function getUserConversations(username: string): Promise<ChatConversation[]> {
  const db = await getMongoDb();
  const cursor = db
    .collection("chats")
    .find({ participants: username }, { projection: { _id: 0 } })
    .sort({ updated_at: -1 });

  const docs = await cursor.toArray();
  return docs.map((doc) => serializeDoc(doc) as unknown as ChatConversation);
}

export async function getAllChats(): Promise<ChatConversation[]> {
  const db = await getMongoDb();
  const cursor = db
    .collection("chats")
    .find({}, { projection: { _id: 0 } })
    .sort({ updated_at: -1 });

  const docs = await cursor.toArray();
  return docs.map((doc) => serializeDoc(doc) as unknown as ChatConversation);
}

export async function getChatConversation(roomId: string): Promise<ChatConversation | null> {
  const db = await getMongoDb();
  const doc = await db.collection("chats").findOne({ room_id: roomId }, { projection: { _id: 0 } });
  return serializeDoc(doc) as unknown as ChatConversation | null;
}

export async function checkMongoConnection(): Promise<Record<string, any>> {
  try {
    const db = await getMongoDb();
    const msgCount = await db.collection("messages").countDocuments({});
    const chatCount = await db.collection("chats").countDocuments({});
    return {
      status: "connected",
      is_mock: false,
      database: CONFIG.MONGODB_DB_NAME,
      message_count: msgCount,
      chat_count: chatCount,
    };
  } catch (err: any) {
    return {
      status: "error",
      error: err?.message || String(err),
    };
  }
}
