# Whispr Backend

This is the backend repository for **Whispr**, a real-time chat application powered by **Bun.js (TypeScript)**, **WebSockets**, and **MongoDB**. Whispr supports real-time, low-latency 1-on-1 direct messaging, group chat rooms, and global world chat without relying on Firebase or third-party proprietary services.

## Features

- **Real-Time WebSockets (`ws://`)**: Bi-directional, real-time messaging powered by Bun's native WebSocket engine and topic pub/sub.
- **MongoDB Persistence**: Chat conversations, messages, timestamps, and participant metadata are stored in MongoDB.
- **Direct & Room Messaging**: Supports 1-on-1 direct chats (automatic deterministic room ID mapping) and general rooms (e.g. `world`).
- **Typing Indicators & Heartbeats**: WebSocket support for live typing status and connection ping/pong keepalives.
- **REST API + WebSockets**: Dual support—send/receive messages via WebSockets or via REST API with automated real-time WebSocket broadcast.
- **User Authentication**: User management with `bun:sqlite` (compatible with existing SQLite accounts) and SimpleJWT-compatible access & refresh tokens.

---

## Technologies Used

- **Bun 1.3+**: High-performance JavaScript/TypeScript runtime.
- **Hono**: Fast, lightweight web framework for REST API routing.
- **Bun Native WebSockets**: High-throughput, sub-millisecond latency WebSocket handling with native topic pub/sub (`ws.subscribe / server.publish`).
- **MongoDB (official driver)**: Flexible NoSQL document database for messages and conversation histories.
- **bun:sqlite**: Native SQLite engine for users, credentials, and authentication.
- **jose**: Type-safe JWT access and refresh token generation.

---

## Getting Started

### 1. Prerequisites
- [Bun](https://bun.sh) (`v1.2+`)
- MongoDB (running locally or via MongoDB Atlas)
- Redis (optional, for multi-node clustering)

### 2. Install Dependencies
```bash
bun install
```

### 3. Run Development Server
```bash
bun run dev
# Or production mode
bun start
```

### 4. Run Tests
```bash
bun test
```

---

## WebSocket API Reference

Connect to WebSocket at:
- `ws://localhost:8000/ws/chat/<room_name>/`
- `ws://localhost:8000/ws/chat/` (defaults to `world` room)

### 1. Send Message
```json
{
  "type": "chat_message",
  "text": "Hello world!",
  "senderId": "alice",
  "recipientId": "bob"
}
```

### 2. Receive Message Broadcast
```json
{
  "type": "chat_message",
  "id": "uuid-here",
  "text": "Hello world!",
  "message": "Hello world!",
  "senderId": "alice",
  "username": "alice",
  "recipientId": "bob",
  "date": "2026-10-13T16:45:00.000Z",
  "room_id": "world"
}
```

### 3. Typing Indicator
Send:
```json
{
  "type": "typing",
  "username": "alice",
  "is_typing": true
}
```
Broadcast received by other participants in room:
```json
{
  "type": "typing",
  "username": "alice",
  "is_typing": true,
  "room": "world"
}
```

### 4. Heartbeat (Ping/Pong)
Send:
```json
{ "type": "ping" }
```
Response:
```json
{ "type": "pong" }
```

---

## REST API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health/` | Health check for server and MongoDB connection |
| `POST` | `/api/signup/` | User registration |
| `POST` | `/api/login/` | User login & JWT issuance |
| `GET` | `/api/messages/?room=world` | Fetch messages from MongoDB for world or specified room |
| `POST` | `/api/messages/` | Send message to world chat & broadcast over WebSockets |
| `GET` | `/api/chats/` | List all conversations or filter by `?username=<name>` |
| `GET` | `/api/chats/<room_id>/messages/` | Get message history for a specific room |
| `POST` | `/api/chats/<room_id>/messages/` | Post message to room & broadcast over WebSockets |
| `GET` | `/api/chats/direct/<other_user>/messages/?user=<current_user>` | Get 1-on-1 messages between users |
| `POST` | `/api/chats/direct/<other_user>/messages/` | Send 1-on-1 message & broadcast over WebSockets |

---

## Running Tests
Run the automated test suite covering MongoDB, REST APIs, and WebSockets:
```bash
bun test
```
