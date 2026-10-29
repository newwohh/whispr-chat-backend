import { describe, it, expect } from "bun:test";
import {
  authenticateUser,
  registerUser,
  getTokensForUser,
  verifyAccessToken,
} from "../src/services/auth";
import { findUserByEmail } from "../src/db/sqlite";

describe("AuthServiceTests", () => {
  it("should authenticate existing user with Django pbkdf2 password", async () => {
    // nevin@admin.com password is "nevin" from credentials.txt
    const user = await authenticateUser("nevin@admin.com", "nevin");
    expect(user).not.toBeNull();
    expect(user?.email).toBe("nevin@admin.com");
    expect(user?.name).toBe("nevin");

    // Invalid password should fail
    const failed = await authenticateUser("nevin@admin.com", "wrongpassword");
    expect(failed).toBeNull();
  });

  it("should register a new user and allow login", async () => {
    const testEmail = `newuser_${Date.now()}@test.com`;
    const user = await registerUser({
      email: testEmail,
      name: "Test Bun User",
      password: "TestPassword123!",
      password2: "TestPassword123!",
      tc: "True",
    });

    expect(user.id).toBeDefined();
    expect(user.email).toBe(testEmail);

    const loggedIn = await authenticateUser(testEmail, "TestPassword123!");
    expect(loggedIn).not.toBeNull();
    expect(loggedIn?.name).toBe("Test Bun User");
  });

  it("should create valid access and refresh tokens with SimpleJWT claims", async () => {
    const tokens = await getTokensForUser({ id: 1 });
    expect(tokens.access).toBeDefined();
    expect(tokens.refresh).toBeDefined();

    const payload = await verifyAccessToken(tokens.access);
    expect(payload).not.toBeNull();
    expect(payload?.token_type).toBe("access");
    expect(payload?.user_id).toBe("1");
  });
});
