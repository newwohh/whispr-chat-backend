import { describe, it, expect } from "bun:test";
import { handleHttpRequest } from "../src/app";

describe("ChatAPITests", () => {
  it("GET /api/health should return healthy status and mongo stats", async () => {
    const req = new Request("http://localhost:8000/api/health/");
    const res = await handleHttpRequest(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("healthy");
    expect(data.websocket_support).toBe(true);
    expect(data.mongodb).toBeDefined();
    expect(data.mongodb.status).toBe("connected");
  });

  it("POST & GET /api/messages/ world chat messages", async () => {
    const postReq = new Request("http://localhost:8000/api/messages/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "testuser",
        message: "Test world chat message from Bun",
      }),
    });
    const postRes = await handleHttpRequest(postReq);
    expect(postRes.status).toBe(201);
    const postData = await postRes.json();
    expect(postData.text).toBe("Test world chat message from Bun");
    expect(postData.senderId).toBe("testuser");

    const getReq = new Request("http://localhost:8000/api/messages/");
    const getRes = await handleHttpRequest(getReq);
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    expect(getData.room).toBe("world");
    expect(Array.isArray(getData.messages)).toBe(true);
    expect(getData.messages.some((m: any) => m.text === "Test world chat message from Bun")).toBe(true);
  });

  it("POST & GET /api/chats/:room_id/messages/ for room discussion", async () => {
    const roomId = "general_discussion_bun_" + Date.now();

    const postReq = new Request(`http://localhost:8000/api/chats/${roomId}/messages/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        senderId: "testuser",
        text: "Hello room from Bun!",
      }),
    });
    const postRes = await handleHttpRequest(postReq);
    expect(postRes.status).toBe(201);
    const postData = await postRes.json();
    expect(postData.status).toBe("success");
    expect(postData.message.text).toBe("Hello room from Bun!");

    const getReq = new Request(`http://localhost:8000/api/chats/${roomId}/messages/`);
    const getRes = await handleHttpRequest(getReq);
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    expect(getData.room_id).toBe(roomId);
    expect(getData.messages.some((m: any) => m.text === "Hello room from Bun!")).toBe(true);
  });

  it("POST & GET /api/chats/direct/:other_user/messages/ 1-on-1 direct messages", async () => {
    const otherUser = "recipient_user_bun";
    const postReq = new Request(`http://localhost:8000/api/chats/direct/${otherUser}/messages/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        senderId: "testuser",
        text: "Private DM from Bun",
      }),
    });
    const postRes = await handleHttpRequest(postReq);
    expect(postRes.status).toBe(201);
    const postData = await postRes.json();
    expect(postData.status).toBe("success");

    const getReq = new Request(`http://localhost:8000/api/chats/direct/${otherUser}/messages/?user=testuser`);
    const getRes = await handleHttpRequest(getReq);
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    expect(getData.participants).toEqual(["testuser", otherUser]);
    expect(getData.messages.some((m: any) => m.text === "Private DM from Bun")).toBe(true);
  });

  it("POST /api/signup/ and /api/login/ flow", async () => {
    const uniqueEmail = `bun_signup_${Date.now()}@example.com`;
    const signupReq = new Request("http://localhost:8000/api/signup/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: uniqueEmail,
        name: "Bun Guy",
        password: "Password123!",
        password2: "Password123!",
        tc: "True",
      }),
    });
    const signupRes = await handleHttpRequest(signupReq);
    expect(signupRes.status).toBe(201);
    const signupData = await signupRes.json();
    expect(signupData.message).toBe("success");
    expect(signupData.token).toBeDefined();

    const loginReq = new Request("http://localhost:8000/api/login/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: uniqueEmail,
        password: "Password123!",
      }),
    });
    const loginRes = await handleHttpRequest(loginReq);
    expect(loginRes.status).toBe(200);
    const loginData = await loginRes.json();
    expect(loginData.msg).toBe("login success");
    expect(loginData.user.email).toBe(uniqueEmail);
    expect(loginData.token).toBeDefined();
    expect(Array.isArray(loginData.users)).toBe(true);
  });
});
